var JAWS = new function() {
    this.func;

    this.args;
    this.argType;
    this.argNShare;

    this.chunkSize;
    this.offset;
    this.i;

    this.useShare;
    this.merge;
    this.step;
};

onmessage = function (e) {
    switch (e.data.mode) {
        case "init":
            JAWS.func = e.data.func;
            JAWS.func = Function.apply(null, JAWS.func.args.concat(JAWS.func.body));

            JAWS.argType = e.data.argType;
            JAWS.argNShare = e.data.argNShare;

            JAWS.useShare = e.data.useShare;
            JAWS.merge = e.data.merge;

            if (e.data.SIMD)
                JAWS.step = 4;
            else 
                JAWS.step = 1;

            JAWS.args = new Array();
            var sharedFloat = 0;
            var sharedUint8C = 0;
            var sharedUint8 = 0;
            var nshared = 0;
            for (var i in JAWS.argType) {
                if (JAWS.argType[i] === "shareFloat32") {
                    JAWS.args[i] = getSharedFloat32(sharedFloat++);

                } else if (JAWS.argType[i] === "shareUint8C") {
                    JAWS.args[i] = getSharedUint8C(sharedUint8C++);

                } else if (JAWS.argType[i] === "shareUint8") {
                    JAWS.args[i] = getSharedUint8(sharedUint8++);

                } else {
                    JAWS.args[i] = JAWS.argNShare[nshared++];
                }
            }

            break;

        case "run":
            JAWS.chunkSize = e.data.chunkSize;
            JAWS.offset = e.data.offset;

            /* exec function */
            for (JAWS.i = 0; JAWS.i < JAWS.chunkSize; JAWS.i++) {
                JAWS.func.apply(JAWS.func, JAWS.args);
            }

            if (JAWS.useShare) {
                postMessage({chunkSize: JAWS.chunkSize});
            } else {
                var temp_buffer = new Array();
                for (var i in JAWS.merge) {
                    temp_buffer[i] = JAWS.args[JAWS.merge[i]].subarray(JAWS.offset * JAWS.step, (JAWS.offset+JAWS.chunkSize) * JAWS.step);
                }
                postMessage({chunkSize: JAWS.chunkSize, output: temp_buffer, offset: JAWS.offset * JAWS.step});
            }
            break;
    }
}

function get_global_id() {
    return JAWS.i + JAWS.offset;
}
