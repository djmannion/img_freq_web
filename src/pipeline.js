"use strict";

// these are each responsible for responding to a 'trigger'
const HANDLERS = [
    require("./input"),
    require("./freq"),
    require("./filter"),
    require("./output"),
];

async function run({data, trigger} = {}) {

    // initialise `data` to an empty object if `undefined`
    data = data ?? {};

    // farm out
    for (let handler of HANDLERS) {
        handler({data: data, trigger: trigger});
    }

}

module.exports = {run: run};
