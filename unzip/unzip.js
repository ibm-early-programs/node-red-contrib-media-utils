/**
* Copyright 2013, 2016 IBM Corp.
*
* Licensed under the Apache License, Version 2.0 (the 'License');
* you may not use this file except in compliance with the License.
* You may obtain a copy of the License at
*
* http://www.apache.org/licenses/LICENSE-2.0
*
* Unless required by applicable law or agreed to in writing, software
* distributed under the License is distributed on an 'AS IS' BASIS,
* WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
* See the License for the specific language governing permissions and
* limitations under the License.
**/
var yauzl = require("yauzl");

module.exports = function (RED) {
  function Node (config) {
    RED.nodes.createNode(this, config);
    var node = this;

    this.on('input', function (msg) {
      if(msg.payload !== '') {
        //write file of buffer
        yauzl.fromBuffer(msg.payload, function(error, zipfile){
          if (error) {
            msg.payload = error
            node.send(msg)
          } else {
            zipfile.on('entry', function(entry) {
              if (/\/$/.test(entry.fileName)) {
                // directory file names end with '/'
              } else {
                // file entry
                zipfile.openReadStream(entry, function(error, readStream) {
                  var bufferArray = []
                  if(error){
                    msg.payload = error;
                    node.send(err)
                  } else {
                    readStream.on('readable', function(){
                      var chunk = readStream.read()
                      if (chunk){
                        bufferArray.push(chunk)
                      }
                    })
                    readStream.on('end', function(){
                      var buffer = Buffer.concat(bufferArray)
                      msg.payload = buffer
                      node.send(msg)
                      bufferArray = []
                    })
                  }
                })
              }
            });
          }
        })
      }
    });
  }
  RED.nodes.registerType('unzip', Node)
}
