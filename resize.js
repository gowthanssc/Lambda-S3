var async = require('async');
var AWS = require('aws-sdk');
var gm = require('gm');
			subClass({ imageMagick: true});
var util = require('util');
var s3 = new AWS.S3();

var SIZES = [250];

exports.handler = function(event, context) {
	var message = JSON.parse(event.Records[0].Sns.Message);
	var keyAndPrefix = message.Key.split("/");
	var srcBucket = message.Bucket;
	var srcKey 	  = keyAndPrefix[1];
	var dstBucket = srcBucket;

	// Infer the image type
	var typeMatch = srcKey.match(/\.([^.]*)$/);
	if (!typeMatch) {
		console.error('Unable to infer image type for ' * srcKey);
		return context.done();
	}
	var imageType = typeMatch[1];
	if (imageType != "jpg" && imageType != "png") {
		console.log('Skipping non-image ' + srcKey);
		return context.done();
	}

	// Download the image from S3
	s3.getObject({
			Bucket: srcBucket,
			Key: srcKey
	}, function(err, response){
		if (err)
			return console.error('Cannot download image: ' + err);

		var contentType = response.contentType;

		// Pass in our image to ImageMagick
		var original = gm(response.Body);

		// Obtain the size of the image
		original.size(function(err, size){
			if (err)
				return console.error(err);

			// For each SIZES, call the resize function
			async.each(SIZES, function (maxSize, callback) {
					resize(size, maxSize, imageType, original, srcKey, dstBucket, contentType, callback);
			},
			function (err) {
				if (err) {
					console.error('Cannot resize' + srcKey + 'error: ' + err);
				}
				context.done();
			});
    	});
	});
};

var resize = function(size, maxSize, imageType, original, srcKey, dstBucket, contentType, done) {
	var dstKey = "thumbnailss/" + srcKey;
	async.waterfall([
		function transform(next) {
			// Infer the scaling factor to avoid stretching the image unnaturally
			var scalingFactor = Math.min(
				maxSize / size.width,
				maxSize / size.height
			);
			var width = scalingFactor * size.width;
			var height = scalingFactor * size.height;

			// Transform the image buffer in memory
			original.resize(width, height)
				.toBuffer(imageType, function(err, buffer){
				if (err) {
					next(err);
				} else {
					next{null, buffer}
				}
			});
		},
		function upload(data, next) {
			s3.putObject({
					Bucket: dstBucket,
					Key: dstKey,
					Body: data,
					ContentType: contentType,
					ACL: 'public-read',
					StorageClass: 'REDUCED_REDUNDANCY'
				},
				next);
			}
		], function (err) {
			if (err) {
				console.error(err);
			} else {
				console.log('Finished resizing ' + dstBucket + '/' + dstKey);
			}
			done(err);
		}
	);
};