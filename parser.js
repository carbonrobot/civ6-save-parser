'use strict';

const _ = require('lodash');
const fs = require('fs');
const util = require('util');

const START_PLAYER = new Buffer([0xBB, 0x63, 0xE3, 0x4F]);
const PLAYER_PASSWORD = new Buffer([0x6C, 0xD1, 0x7C, 0x6E]);
const PLAYER_NAME = new Buffer([0xFD, 0x6B, 0xB9, 0xDA]);
const PLAYER_CURRENT_TURN = new Buffer([0xCB, 0x21, 0xB0, 0x7A]);
const END_PLAYER = new Buffer([0x58, 0xBA, 0x7F, 0x4C]);

(() => {
  module.exports.parse = (filename, options) => {
    options = _.defaults(options, {
      allKeys: false
    });

    const data = fs.readFileSync(filename);
    const result = {
      players: []
    };

    const buffer = new Buffer(data);

    let state;

    while (null !== (state = scan(buffer, state))) {
      if (state.last4.equals(START_PLAYER)) {
        result.players.push({
          pos: state.pos,
          data: readPlayer(buffer, state)
        });
      }
    }

    return result;
  };

  if (!module.parent) {
    var argv = require('minimist')(process.argv.slice(2));
    if (!argv._.length) {
      console.log('Please pass the filename as the argument to the script.');
    } else {
      console.log(util.inspect(module.exports.parse(argv._[0], argv), false, null));
    }
  }
})();

// Parse helper functions

function scan(buffer, state) {
  if (!state) {
    state = {
      pos: 4,
      last4: buffer.slice(0, 4)
    };
  } else {
    state.pos++;

    if (state.pos >= buffer.length) {
      return null;
    }

    state.last4 = buffer.slice(state.pos - 4, state.pos);
  }

  return state;
}

function readPlayer(buffer, state) {
  const result = {};

  while ((state = scan(buffer, state)) != null && !state.last4.equals(END_PLAYER)) {
    if (state.last4.equals(PLAYER_PASSWORD)) {
      result.password = {
        pos: state.pos,
        value: readString(buffer, state)
      };
    } else if (state.last4.equals(PLAYER_NAME)) {
      result.name = {
        pos: state.pos,
        value: readString(buffer, state)
      };
    } else if (state.last4.equals(PLAYER_CURRENT_TURN)) {
      result.isCurrentTurn = {
        pos: state.pos,
        value: readBoolean(buffer, state)
      };
    }
  }

  return result;
}

function readString(buffer, state) {
  let result = null;

  if (buffer.readUInt32LE(state.pos) === 5) {
    state.pos += 4;
    const strLen = buffer.readUInt16LE(state.pos);
    state.pos += 2;

    if (buffer.slice(state.pos, state.pos + 6).equals(new Buffer([0, 0x21, 1, 0, 0, 0]))) {
      state.pos += 6;
      result = buffer.slice(state.pos, state.pos + strLen - 1).toString(); // Ignore null terminator
      state.pos += strLen;
    }
  }

  return result;
}

function readBoolean(buffer, state) {
  let result = false;

  if (buffer.readUInt32LE(state.pos) === 1) {
    state.pos += 12;
    return !!buffer[state.pos];
  }

  return result;
}

function getChunk(buffer, startIndex) {
  const stringDelimiter = new Buffer([5, 0, 0, 0]);

  const result = {
    startIndex: buffer.indexOf(stringDelimiter, startIndex)
  };

  if (result.startIndex > 0) {
    const strLen = buffer.readUInt16LE(result.startIndex + 4);

    if (buffer.indexOf(new Buffer([0, 0x21, 1, 0, 0, 0]), result.startIndex) === result.startIndex + 6) {
      result.rawKey = buffer.readUInt32LE(result.startIndex - 4);

      if (CHUNK_KEYS[result.rawKey]) {
        result.key = CHUNK_KEYS[result.rawKey];
      }

      result.endIndex = result.startIndex + 12 + strLen;
      result.data = buffer.slice(result.startIndex + 12, result.endIndex).toString();
    } else {
      result.endIndex = result.startIndex + 4;
    }

    return result;
  }

  return null;
}
