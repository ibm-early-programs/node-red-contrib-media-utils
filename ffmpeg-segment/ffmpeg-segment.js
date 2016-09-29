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

  var outputCSV = 'out.csv';
  var timeouts = [];

  // Utility function to perform a URL validation check. Copied from speech_to_text.
  function urlCheck(str) {
    var parsed = url.parse(str);

    return (!!parsed.hostname && !!parsed.protocol && str.indexOf(' ') < 0);
  }

  function Node (config) {
    RED.nodes.createNode(this, config);
    var node = this;

    this.on('input', function (msg) {
      // Cancel any waiting timeouts
      for (var i = 0; i < timeouts.length; ++i) {
        clearTimeout(timeouts[i]);
      }
      timeouts = [];
      node.status({});

      var message;

      // Return error and clean up
      function nodeError(nodeText, debugMsg) {
        if (nodeText) {
          node.status({fill:'red', shape:'ring', text: nodeText});
        }

        message = debugMsg;
        temp.cleanup();
        node.error(message, msg);
      }

      function nodeSend(buffer, timesplit) {
        msg.payload = buffer;
        msg.timesplit = timesplit;
        temp.cleanup();
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
      var readFileToBuffer = function(path, timesplit, cb) {
        var readableStream  = fs.createReadStream(path);

        toArray(readableStream).then(function (parts) {
          var buffers = [];

          for (var i = 0; i < parts.length; ++i) {
            var part = parts[i];
            buffers.push((part instanceof Buffer) ? part : new Buffer(part));
          }

          fs.unlink(path);
          cb(Buffer.concat(buffers), timesplit);
        });
      };

      // Using silence timestamp array, run FFmpeg command to make copies of segments of the original file. A CSV of the outputted file names and timestamps are saved to outputCSV.
      var splitOnSegments = function(path, splitTimes, cb) {
        if (splitTimes.length > 0) {
          ffmpeg(path)
            .outputOptions('-codec copy')
            .outputOptions('-map 0')
            .outputOptions('-f segment')
            .outputOptions('-segment_list ' + outputCSV)
            .outputOptions('-segment_times ' + splitTimes.join())
            .on('end', function() {
              cb(true);
            })
            .output('out%03d.wav')
            .run();
        } else {
          cb(false);
        }
      };

      // Performs action to get silence segments and then splits audio
      function performAction(pathToFile) {
        var splitTimes = msg.times;

        splitOnSegments(pathToFile, splitTimes, function(split) {
          if (split) {
            fs.readFile(outputCSV, 'utf8', function(err, data) {
              if (err) {
                fs.unlink(outputCSV);
                return nodeError('unable to read segmented files', 'Node has been unable to read segmented files');
              }

              var lines = data.split('\n');
              var numCompleted = 0;
              var numSent = 0;

              // Send buffer in msg.buffer from node
              var sendBuffer = function(buffer, timesplit) {
                if (++numCompleted === lines.length - 1) {
                  fs.unlink(outputCSV);

                  if (!config.timeout) {
                    node.status({});
                  }
                }

                // Set timeout for each buffer
                var doTimeout = function(buffer, delay, timesplit) {
                  node.status({fill:'blue', shape:'dot',
                    text:'waiting'});

                  var timeout = setTimeout(function() {
                    if (++numSent === lines.length - 1) {
                      node.status({});
                    }
                    nodeSend(buffer, timesplit);
                  }, delay);

                  timeouts.push(timeout);
                };

                if (config.timeout) {
                  var delay = timesplit[0] * 1000; // milliseconds
                  doTimeout(buffer, delay, timesplit);
                } else {
                  node.status({});
                  nodeSend(buffer, timesplit);
                }
              };

              for (var i = 0; i < lines.length - 1; ++i) {
                var file = lines[i].split(',')[0];
                var startTime = i === 0 ? 0 : splitTimes[i-1];
                var endTime = splitTimes[i];
                var timesplit = [startTime, endTime];
                readFileToBuffer(file, timesplit, sendBuffer);
              }
            });
          } else {
            readFileToBuffer(pathToFile, null, function(buffer) {
              node.status({});
              nodeSend(buffer);
            });
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
  RED.nodes.registerType('ffmpeg-segment', Node);
};
