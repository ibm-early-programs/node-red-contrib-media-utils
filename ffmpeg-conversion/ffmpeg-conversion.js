/**
 * Copyright 2013,2015 IBM Corp.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 **/

module.exports = function (RED) {
  'use strict';
  var request = require('request');
  var ffmpeg = require('easy-ffmpeg');
  var toArray = require('stream-to-array');
  var url = require('url');
  var temp = require('temp').track();
  var fs = require('fs');
  var path = require('path');

  // Utility function to perform a URL validation check. Copied from speech_to_text.
  function urlCheck(str) {
    var parsed = url.parse(str);

    return (!!parsed.hostname && !!parsed.protocol && str.indexOf(' ') < 0);
  }

  function Node (config) {
    RED.nodes.createNode(this, config);
    var node = this;

    this.on('input', function (msg) {
      var message;

      if (msg.format) {
        config.format = msg.format;
      }

      // Return error and clean up
      function nodeError(nodeText, debugMsg) {
        if (nodeText) {
          node.status({fill:'red', shape:'ring', text: nodeText});
        }

        message = debugMsg;
        temp.cleanup();
        node.error(message, msg);
      }

      function nodeSend(buffer) {
        msg.payload = buffer;
        temp.cleanup();
        node.status({});
        node.send(msg);
      }

      // This section is for var functions that will be called, in context with
      // msg, when the input stream has been received.

      // Function that is syncing up the asynchronous nature of the stream
      // so that the full file can be sent to the API. Copied and edited from speech_to_text.
      var stream_buffer = function(file, contents, cb) {
        node.status({fill:'blue', shape:'dot',
          text:'reading buffer'});
        fs.writeFile(file, contents, function (err) {
          cb(err);
        });
      };

      // Function that is syncing up the asynchronous nature of the stream
      // so that the full file can be sent to the API. Copied and edited from speech_to_text.
      var stream_url = function(file, url, cb) {
        var wstream = fs.createWriteStream(file);
        node.status({fill:'blue', shape:'dot',
          text:'downloading file'});

        wstream
          .on('error', function(err) {
            cb(err);
          })
          .on('finish', function () {
            cb();
          });

        request(url).pipe(wstream);
      };

      // Generate buffer that is sent out of node on msg.buffer
      var readFileToBuffer = function(path, cb) {
        var readableStream  = fs.createReadStream(path);

        toArray(readableStream).then(function (parts) {
          var buffers = [];

          for (var i = 0; i < parts.length; ++i) {
            var part = parts[i];
            buffers.push((part instanceof Buffer) ? part : new Buffer(part));
          }

          cb(Buffer.concat(buffers));
        });
      };

      // Performs the ffmpeg call to convert input into output format
      function performAction(pathToFile) {
        temp.open({suffix: '.' + config.format}, function(err, info) {
          if (err) {
            return nodeError('unable to open url video stream', 'Node has been unable to open the url video stream');
          }

          // General FFmpeg progress functions to set node status
          var conversionStart = function() {
            node.status({fill:'blue', shape:'dot',
              text:'converting'});
          };

          var conversionError = function(err) {
            console.log(err)
            nodeError('ffmpeg conversion failed', 'FFmpeg failed to perform the conversion');
          };

          // Once input has been read to temp file, read into a buffer and send
          var conversionEnd = function() {
            readFileToBuffer(info.path, nodeSend);
          };


          var numChannels = 1;
          var frequency = 22050;
          if (config.audiochannels && config.audiochannels == 'stereo') {
            numChannels = 2;
            frequency = 48000;
          }

          if (ext === '.' + config.format) {
            readFileToBuffer(pathToFile, nodeSend);
          } else {
            var stream  = fs.createWriteStream(info.path);
            ffmpeg(pathToFile)
              .format(config.format)
              .noVideo()
              // If Video is required then this set of 3 options works for MP4
              // with msg.format ='mp4'
              // Also doesn't appear to harm audio options so keeping it in
              // until someone complains.
              .outputOptions('-c:v libx264')
              .outputOptions('-pix_fmt yuv420p')
              .outputOptions('-movflags frag_keyframe+empty_moov')
              //
              .audioChannels(numChannels)
              .audioFrequency(frequency)
              .on('start', conversionStart)
              .on('error', conversionError)
              .on('end', conversionEnd)
              .output(stream)
              .run();
          }
        });
      }

      // Check payload
      if (!msg.payload) {
        return nodeError(null, 'Missing property: msg.payload');
      }

      // Check payload
      if (!(msg.payload instanceof Buffer) && typeof msg.payload === 'string' && !urlCheck(msg.payload)) {
        return nodeError(null, 'Invalid URL.');
      }

      if (msg.payload instanceof Buffer) {
        temp.open({suffix: '.buffer'}, function (err, info) {
          if (err) {
            return nodeError('unable to open buffer', 'Node has been unable to open the buffer');
          }

          // Stream buffer into temp file
          stream_buffer(info.path, msg.payload, function (err) {
            if (err) {
              return nodeError('unable to open buffer', 'Node has been unable to open the buffer');
            }

            performAction(info.path);
          });
        });
      } else {
        var ext = path.extname(msg.payload);
        temp.open({suffix: ext}, function(err, info) {
          if (err) {
            return nodeError('unable to open url stream', 'Node has been unable to open the url stream');
          }

          stream_url(info.path, msg.payload, function (err) {
            if (err) {
              return nodeError('url stream not recognised', 'Node did not recognise the url stream');
            }

            performAction(info.path);
          });
        });
      }
    });
  }
  RED.nodes.registerType('ffmpeg-conversion', Node);
};
