/*  NanoWasp - A MicroBee emulator
 *  Copyright (C) 2007, 2011 David G. Churchill
 *
 *  This file is part of NanoWasp.
 *
 *  NanoWasp is free software; you can redistribute it and/or modify
 *  it under the terms of the GNU General Public License as published by
 *  the Free Software Foundation; either version 3 of the License, or
 *  (at your option) any later version.
 *
 *  NanoWasp is distributed in the hope that it will be useful,
 *  but WITHOUT ANY WARRANTY; without even the implied warranty of
 *  MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 *  GNU General Public License for more details.
 *
 *  You should have received a copy of the GNU General Public License
 *  along with this program.  If not, see <http://www.gnu.org/licenses/>.
 */

/*!
 *   Virtual tape support based on TAP file idea in uBee512. 
 */

var nanowasp = nanowasp || {};

nanowasp.TapeInjector = function (z80cpu) {
    this._z80cpu = z80cpu;
    this._data = [];
    this._offset = 0;

    this._write_state = ['find_header', 0];
};

nanowasp.TapeInjector.prototype = {
    READ_LOCATION: 0xAB6D,

    WRITE_LOCATION: 0xAB26,
     
    reset: function () {
        this._offset = 0;
        this._z80cpu.setBreakpoint(this.READ_LOCATION, utils.bind(this._readByte, this));
        this._z80cpu.setBreakpoint(this.WRITE_LOCATION, utils.bind(this._writeByte, this));
    },
    
    setData: function (data) {
        this._data = data;
        this._offset = 0;
    },
    
    _readByte: function () {
        var value = 0;
        if (this._offset < this._data.length) {
            value = this._data[this._offset];
            this._offset++;
        }
        
        z80.a = value;
        z80_ret();
    },

    _writeByte: function () {
        var value = z80.a;
        z80_ret();

        // TODO: Merge this parser in with the serializer in VirtualTape, and share the type detection.

        var string_t = ['', function (a, n) { return a + String.fromCharCode(n); }];
        var int_t = [0, function (a, n) { return a / 256 + 256 * n; }];  // Er, well it works for 2 bytes :D
        var null_t = [0, function (a, n) { return 0; }];

        var header = [
            ['name', 6, string_t],
            ['type', 1, string_t],
            ['length', 2, int_t],
            ['skip', 8, null_t]
        ];

        var blockSize = 256;

        switch (this._write_state[0]) {
            case 'find_header':
                if (value == this._write_state[1]) {
                    switch (this._write_state[1]) {
                        case 0:
                            this._write_state[1] = 1;
                            break;

                        case 1:
                            this._write_state = ['header', 0, 0];
                            this._write_header = {};
                    }
                }
                break;

            case 'header':
                var entry = header[this._write_state[1]];

                if (this._write_state[2] == 0) {
                    this._write_header[entry[0]] = entry[2][0];
                }

                this._write_header[entry[0]] = entry[2][1](this._write_header[entry[0]], value);
                this._write_state[2] += 1;

                if (this._write_state[2] == entry[1]) {
                    this._write_state[1] += 1;
                    this._write_state[2] = 0;

                    if (this._write_state[1] == header.length) {
                        this._write_state = ['data', 0];
                        this._write_data = [];
                    }
                }
                break;

            case 'data':
                if (this._write_state[1] == blockSize) {
                    // Checksum, ignore
                    this._write_state[1] = 0;
                } else {
                    this._write_data.push(value);
                    this._write_state[1] += 1;
                }

                if (this._write_data.length == this._write_header['length']) {
                    console.log('Got file ' + this._write_header.name + ' of type ' + this._write_header.type + ' with length ' + this._write_header.length);
                    var blob = new Blob([new Uint8Array(this._write_data)], {type: 'application/octet-binary'});
                    saveAs(blob, utils.trimRight(this._write_header.name) + (this._write_header.type == 'M' ? '.bin' : '.mwb'));
                    
                    // There'll be one more checksum byte, but the find_header state will ignore it.
                    this._write_state = ['find_header', 0];
                }
                break;
        }
    }
};
