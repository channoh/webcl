var err;                                    // error code returned from API calls
var correct;                                // number of correct results returned

var cl;                                     // OpenCL context
var platforms;                              // array of compue platform ids
var platform;                               // compute platform id
var devices;                                // array of device ids
var device;                                 // compute device id
var context;                                // compute context
var queue;                                  // compute command queue
var program;                                // compute program
var kernel;                                 // compute kernel

var workGroupSize;
var globalWorkSize;
var localWorkSize;

var deviceType = webcl.DEVICE_TYPE_GPU;

var kernelSource;
var d_args = new Array();
var h_args = new Array();
var d_len  = new Array();
var JAWS = new function() {
    this.func;
    this.kernelName;
    this.argType;
    this.argNShare;
    this.chunkSize;
    this.offset;
    this.useShare;
    this.merge;
    this.step;
};

cl = webcl;
platforms = cl.getPlatforms();


for (var i=0; i<platforms.length; i++) {
    platform = platforms[i];
    var dev = platform.getDevices();

    for (var j=0; j<dev.length; j++) {
        if (dev[j].getInfo(webcl.DEVICE_TYPE) == deviceType) {
            device = dev[j];
            break;
        }
    }
    if (typeof(device) != "undefined") break;
}

context = cl.createContext({platform: platform, devices: [device], deviceType: deviceType});
queue = context.createCommandQueue(device, null);


onmessage = function (e) {
    var mode = e.data.mode;
    switch (mode) {
        case "init":
            JAWS.argType = e.data.argType;
            JAWS.argNShare = e.data.argNShare;
            JAWS.useShare = e.data.useShare;
            JAWS.merge = e.data.merge;
            JAWS.kernelName = e.data.kernelName;

            if (e.data.SIMD)
                JAWS.step = 4;
            else 
                JAWS.step = 1;

            kernelSource = e.data.kernel;
            program = context.createProgram(kernelSource);
            program.build([device]);
            // kernel = program.createKernel("JAWS_main");
            kernel = program.createKernel(JAWS.kernelName);

            workGroupSize = device.getInfo(cl.DEVICE_MAX_WORK_GROUP_SIZE);

            var float32idx = 0;
            var uint8cidx = 0;
            var uint8idx = 0;
            var nshared = 0;
            for (var i in JAWS.argType) {
                var type = JAWS.argType[i];
                if (type === "shareFloat32") {
                    h_args[i] = getSharedFloat32(float32idx++); 
					if (typeof(d_args[i]) == "undefined" || d_len[i] < bytes(h_args[i])) {
						d_args[i] = context.createBuffer(cl.MEM_READ_WRITE, bytes(h_args[i]));
                        d_len[i] = bytes(h_args[i]);
                    }
                    queue.enqueueWriteBuffer(d_args[i], true, 0, bytes(h_args[i]), h_args[i]);
                    kernel.setArg(i, d_args[i]);

                } else if (type === "shareUint8C") {
                    h_args[i] = getSharedUint8C(uint8cidx++);
                    // print(bytes(h_args[i])/1024/1024 + " MB");
					if (typeof(d_args[i]) == "undefined" || d_len[i] < bytes(h_args[i])) {
						d_args[i] = context.createBuffer(cl.MEM_READ_WRITE, bytes(h_args[i]));
                        d_len[i] = bytes(h_args[i]);
                    }
                    queue.enqueueWriteBuffer(d_args[i], true, 0, bytes(h_args[i]), h_args[i]);
                    kernel.setArg(i, d_args[i]);

                } else if (type === "shareUint8") {
                    h_args[i] = getSharedUint8(uint8idx++);
                    // print(bytes(h_args[i])/1024/1024 + " MB");
					if (typeof(d_args[i]) == "undefined" || d_len[i] < bytes(h_args[i])) {
						d_args[i] = context.createBuffer(cl.MEM_READ_WRITE, bytes(h_args[i]));
                        d_len[i] = bytes(h_args[i]);
                    }
                    queue.enqueueWriteBuffer(d_args[i], true, 0, bytes(h_args[i]), h_args[i]);
                    kernel.setArg(i, d_args[i]);

                } else if (type === "typedArray") {
                    h_args[i] = JAWS.argNShare[nshared++];
					if (typeof(d_args[i]) == "undefined" || d_len[i] < bytes(h_args[i])) {
						d_args[i] = context.createBuffer(cl.MEM_READ_WRITE, bytes(h_args[i]));
                        d_len[i] = bytes(h_args[i]);
                    }
                    queue.enqueueWriteBuffer(d_args[i], true, 0, bytes(h_args[i]), h_args[i]);
                    kernel.setArg(i, d_args[i]);

                } else if (type === "float") {
                    h_args[i] = JAWS.argNShare[nshared++];
                    kernel.setArg(i, new Float32Array([h_args[i]]));

                } else { // int
                    h_args[i] = JAWS.argNShare[nshared++];
                    kernel.setArg(i, new Int32Array([h_args[i]]));
                }
            }
            break;

        case "run":
            JAWS.offset = e.data.offset;
            JAWS.chunkSize = e.data.chunkSize;

            globalWorkSize = new Int32Array([JAWS.chunkSize]);
            localWorkSize = new Int32Array([Math.min(workGroupSize, JAWS.chunkSize)]);  

            var offset = new Int32Array([JAWS.offset]);
            queue.enqueueNDRangeKernel(kernel, offset, globalWorkSize, localWorkSize);
            queue.finish();

            var temp_buffer = new Array();
            for (var i in JAWS.merge) {
                var idx = JAWS.merge[i];
                var start = h_args[idx].BYTES_PER_ELEMENT * JAWS.offset * JAWS.step;
                var len = h_args[idx].BYTES_PER_ELEMENT * JAWS.chunkSize * JAWS.step;
                temp_buffer[i] = h_args[idx].subarray(JAWS.offset * JAWS.step, (JAWS.offset+JAWS.chunkSize) * JAWS.step);
                queue.enqueueReadBuffer(d_args[idx], true, start, len, temp_buffer[i]);
            }


            if (JAWS.useShare) {
                postMessage({chunkSize: JAWS.chunkSize});
            } else {
                postMessage({chunkSize: JAWS.chunkSize, output: temp_buffer, offset: JAWS.offset * JAWS.step});
            }

            break;

    }
}

function bytes(d) {
    return d.BYTES_PER_ELEMENT * d.length;
}
