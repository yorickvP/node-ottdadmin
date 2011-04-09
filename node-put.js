// Copyright 2010 James Halliday (mail@substack.net)
// based on https://github.com/substack/node-put (added this comment)
//This project is free software released under the MIT/X11 license:

//Permission is hereby granted, free of charge, to any person obtaining a copy
//of this software and associated documentation files (the "Software"), to deal
//in the Software without restriction, including without limitation the rights
//to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
//copies of the Software, and to permit persons to whom the Software is
//furnished to do so, subject to the following conditions:

//The above copyright notice and this permission notice shall be included in
//all copies or substantial portions of the Software.

//THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
//IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
//FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
//AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
//LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
//OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
//THE SOFTWARE.


module.exports = Put;
function Put () {
    if (!(this instanceof Put)) return new Put;
    
    var words = [];
    var len = 0;
    
    this.put = function (buf) {
        words.push({ buffer : buf });
        len += buf.length;
        return this;
    };
    
    this.word8 = function (x) {
        words.push({ bytes : 1, value : x });
        len += 1;
        return this;
    };
    
    this.floatle = function (x) {
        words.push({ bytes : 'float', endian : 'little', value : x });
        len += 4;
        return this;
    };
    
    [ 8, 16, 32, 64 ].forEach((function (bits) {
        this['word' + bits + 'be'] = function (x) {
            words.push({ endian : 'big', bytes : bits / 8, value : x });
            len += bits / 8;
            return this;
        };
        
        this['word' + bits + 'le'] = function (x) {
            words.push({ endian : 'little', bytes : bits / 8, value : x });
            len += bits / 8;
            return this;
        };
    }).bind(this));
    
    this.pad = function (bytes) {
        words.push({ endian : 'big', bytes : bytes, value : 0 });
        len += bytes;
        return this;
    };
    
    this.buffer = function () {
        var buf = new Buffer(len);
        var offset = 0;
        words.forEach(function (word) {
            if (word.buffer) {
                word.buffer.copy(buf, offset, 0);
                offset += word.buffer.length;
            }
            else if (word.bytes == 'float') {
                // s * f * 2^e
                var v = Math.abs(word.value);
                var s = (word.value >= 0) * 1;
                var e = Math.ceil(Math.log(v) / Math.LN2);
                var f = v / (1 << e);
                console.dir([s,e,f]);
                
                console.log(word.value);
                
                // s:1, e:7, f:23
                // [seeeeeee][efffffff][ffffffff][ffffffff]
                buf[offset++] = (s << 7) & ~~(e / 2);
                buf[offset++] = ((e & 1) << 7) & ~~(f / (1 << 16));
                buf[offset++] = 0;
                buf[offset++] = 0;
                offset += 4;
            }
            else if (word.endian == 'big') {
                for (var i = (word.bytes - 1) * 8; i >= 0; i -= 8) {
                    buf[offset++] = (word.value >> i) & 0xff;
                }
            }
            else {
                for (var i = 0; i < word.bytes * 8; i += 8) {
                    buf[offset++] = (word.value >> i) & 0xff;
                }
            }
        });
        return buf;
    };
    
    this.write = function (stream) {
        stream.write(this.buffer());
    };
}
