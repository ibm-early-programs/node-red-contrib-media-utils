node-red-contrib-media-utils
=====================

<a href="http://nodered.org" target="_new">Node-RED</a> media nodes using <a href="http://ffmpeg.org/">FFmpeg</a>.

Install
-------

Run the following command in the root directory of your Node-RED install

    npm install node-red-contrib-media-utils

Usage
-----

### FFmpeg Conversion

Converts any audio or video format supported by FFmpeg into any supported audio format.

Supported `msg.payload` types:

* String URL to audio or video
* Buffer Raw Audio Bytes

Should support any audio or video input currently supported by FFmpeg. Full list found <a href="https://ffmpeg.org/general.html#File-Formats">here</a>.

Supported output formats (audio only):

* MP3
* WAV
* FLAC
* OGG

Returns a buffer of the converted data on `msg.payload`.

Currently been tested with:

* MP4 to MP3/WAV/FLAC/OGG
* WAV to MP3/WAV/FLAC/OGG

### FFmpeg Silence Detection

Performs <a href="https://ffmpeg.org/ffmpeg-filters.html#silencedetect">silence detection</a> provided by FFmpeg on audio files.

Supported `msg.payload` types:

* String URL to audio
* Buffer Raw Audio Bytes

Should support any audio input currently supported by FFmpeg. Full list found <a href="https://ffmpeg.org/general.html#File-Formats">here</a>.

Returns a buffer of the audio data on `msg.payload`.

Currently been tested with:

* WAV

**Defaults**
* Noise tolerance: 0.008 amplitude ratio
* Duration: 0.8 seconds

Resulting silence start and end times (in seconds) will be returned as an array on `msg.silences`, eg. `[[0, 2], [5, 6]]`.

### FFmpeg Segment

Splits audio files and sends a message for each segment.

Supported msg.payload types:

* String URL to audio
* Buffer Raw Audio Bytes

Should support any audio input currently supported by FFmpeg. Full list found <a href="https://ffmpeg.org/general.html#File-Formats">here</a>.

Returns a buffer of the split data on `msg.payload`.

Currently been tested with:

* WAV

This node splits the input into a number of segments. It splits the audio using times specified on `msg.times`, eg. `[5, 10]` will split the audio at 5 seconds and 10 seconds.

Each resulting segment will be sent as an individual message on `msg.payload` from the node. The timesplits of each segment will be available on `msg.timesplit`, eg. a timesplit of `[0, 5]` started at 0 and ended at 5 seconds in the original.

Checking the "Send split messages in order with delay" checkbox will add a delay between sending each message. This delay will be equal to the previous segments length in seconds. This allows you to play the segments through a speaker in the original order for testing purposes.

### Unzip

Unzips a `.zip` folder into separate files. 

The node requires a `.zip` input file and will output the contents on the node's `msg.payload` object. 

Supported msg.payload types:

* `.zip` file

Output types: 

* A separate `buffer` for each of the files contained within the input folder. 


#### Gotchas

Please note that currently the node returns a buffer of all the files contained in the `.zip` including any dotfiles. 



## Contributing

For simple typos and fixes please just raise an issue pointing out our mistakes. If you need to raise a pull request please read our [contribution guidelines](https://github.com/ibm-early-programs/node-red-contrib-media-utils/blob/master/CONTRIBUTING.md) before doing so.

## Copyright and license

Copyright 2014, 2016 IBM Corp. under the Apache 2.0 license.
