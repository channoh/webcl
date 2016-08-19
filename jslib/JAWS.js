function JAWS(nCPU) {

    /* Attribute */
    this.initRate = 0.002;          // intial chunk
    this.merge = [0];
    this.SIMD = false;
    this.ext = null;
    this.debug = false;
    this.useCPU = true;

	/* Configurations */
    var numCPU = 2;                 // number of CPU cores

    /* Global variables */
    var done;                       // completed items
    var offset;                     // next item index
    var DATA_SIZE;                  // total data size for chunking
    var ext;                        // external function
    var PATH = "../jslib/";
    var that = this;

    if (nCPU)
        numCPU = nCPU;

    var debug = function() {
        console.debug.apply(console, arguments);
    };

    /* job queue */
    var job = new function() {
        this.index = -1;
        this.complete = 0;

        this.id = new Array();
        this.JS = new Array();
        this.CL = new Array();
        this.argType = new Array();
        this.argNShare = new Array();
        this.merge = new Array();

        this.data_size = new Array();
        this.ext = new Array();
    };


    /* CPU worker */
    var CPU = new function() {
        this.chunkSize;
        var wait = 0;
        var start = 0;
        var end = 0;
        this.done = 0;

        var worker = new Array();
        for (var i=0; i<numCPU; i++) {
            worker[i] = createWorker(PATH+"workerCPU.js");
            worker[i].onmessage = onMsg;
            worker[i].onerror = function(e) {
                throw e.message + " @ workerCPU.js:" + e.lineno;
            };
        }

        this.addWorker = function(numCPU2) {
            for (var i=numCPU; i<numCPU2; i++) {
                worker[i] = createWorker(PATH+"workerCPU.js");
                worker[i].onmessage = onMsg;
                worker[i].onerror = function(e) {
                    throw e.message + " @ workerCPU.js:" + e.lineno;
                };
            }
        };

        this.init = function(func, type, nshare, merge) {
            for (var i=0; i<numCPU; i++) {
                worker[i].postMessage({mode: "init", func: func, argType: type, argNShare: nshare,
                                       merge: merge, SIMD: that.SIMD});
            }
        };

        this.run = function() {
            if (CPU.chunkSize > 0) {
                var chunkSizePerCore = parseInt(CPU.chunkSize / numCPU);
                if (chunkSizePerCore > 0) {
                    for (var i=0; i<numCPU; i++) {
						worker[i].postMessage({mode: "run", offset: offset, chunkSize: chunkSizePerCore});
                        offset += chunkSizePerCore;
                    }
                } else {
                    for (var i=0; i<numCPU; i++) {
                        if ((DATA_SIZE - offset) >= 1) chunkSizePerCore = 1;
                        else chunkSizePerCore = 0;
						worker[i].postMessage({mode: "run", offset: offset, chunkSize: chunkSizePerCore});
                        offset += chunkSizePerCore;
                    }
                }
            }
        };

        /* CPU onmessage */
        function onMsg(e) {
            var chunkSize = e.data.chunkSize;
            var slope;

            done += chunkSize;
            CPU.done += chunkSize;

            var jid = job.complete;
            for (var i in e.data.output) {
                job.argNShare[jid][job.merge[jid][i]].set(e.data.output[i], e.data.offset);
            }

            wait ++;
            if (wait == numCPU) {
                wait = 0;

                if (DATA_SIZE - offset >= CPU.chunkSize) {
                    CPU.run();

                } else if (DATA_SIZE - offset > 0) {
                    CPU.chunkSize = DATA_SIZE - offset;
                    CPU.run();

                } else if (done == DATA_SIZE) {
                    finishJob();
                }
            }
        }
    };


    /* src */
    this.src = function() {
        var func, kernel;

        if (arguments.length < 2) {
            console.error("please insert kernels...");
            return false;
        }

        func = loadKernel(arguments[0]);
        func = toStr(func);
        kernel = loadKernel(arguments[1]);

        job.index++;
        job.id[job.index] = arguments[0].substring(0, arguments[0].lastIndexOf("."));
        job.JS[job.index] = func;
        job.CL[job.index] = kernel;
    };


    /* arg */
    this.arg = function() {
        var args = Array.prototype.slice.call(arguments);
        var argType = new Array();
        var argNShare = new Array();

        for (var i in args) {
            var val = args[i];

            if (val instanceof Float32Array) {
                argType.push("typedArray");
                argNShare.push(val);

            } else if (val instanceof Uint8ClampedArray) {
                argType.push("typedArray");
                argNShare.push(val);

            } else if (val instanceof Uint8Array) {
                argType.push("typedArray");
                argNShare.push(val);

            } else {
                if (isInt(val)) {
                    argType.push("int");
                } else {
                    argType.push("float");
                }
                argNShare.push(val);
            }
        }

        var index = job.index;
        job.data_size[index]    = args[0].length;
        job.argType[index]      = argType;
        job.argNShare[index]    = argNShare;
    };


    /* run */
    this.run = function() {
		if (that.ext != null) {
			job.ext[job.index] = that.ext;
            that.ext = null;
        }

        if (that.merge != [0]) {
			job.merge[job.index] = that.merge;
            that.merge = [0];
		}

		if (that.debug === false)
            debug = function(){};
        
        if (job.index == job.complete) {
            execJob();
        }
    };

    /* setAttribute*/
    this.setAttr = function(e) {
        if (e.growthRate) {
            growthRate = e.growthRate;
        }

        if (e.initRate) {
            that.initRate = e.initRate;
        }

        if (e.merge) {
            that.merge = e.merge;
        }

        if (e.SIMD) {
            that.SIMD = e.SIMD;
        }

        if (e.ext) {
            that.ext = e.ext;
        }

        if (e.debug) {
            that.debug = e.debug;
        }

        if (e.useCPU) {
            that.useCPU = e.useCPU;
        }

        if (e.useGPU) {
            that.useGPU = e.useGPU;
        }

        if (e.numCPU) {
            if (e.numCPU > numCPU)
                CPU.addWorker(e.numCPU);
            numCPU = e.numCPU;
        }

    }


    /* internal functions */
    /* the end of a job */
    function finishJob() {
        /* Stopwatch end */

        if (ext != null) {
            ext();
        }
        job.complete++;
        if (job.index >= job.complete) {
            execJob();
        }
    }

    /* start a job */
    function execJob() {
        debug("run job " + job.complete);
        done = 0;
        offset = 0;

        var i = job.complete;
        DATA_SIZE = job.data_size[i];
        if (that.SIMD)
            DATA_SIZE /= 4;
        ext = job.ext[i];

        CPU.chunkSize = 256;

        debug("DATA_SIZE: " + DATA_SIZE);
        debug("init CPU chunkSize: " + CPU.chunkSize);

        if (that.useCPU) {
            CPU.init(job.JS[i], job.argType[i], job.argNShare[i], job.merge[i]);
            CPU.run();
		}
	}

    /* load kernel */
	function loadKernel(file) {
        var kernelSource;
        var X = new XMLHttpRequest();
        X.open("GET", file, false);
        X.send();

        if (X.status === 200 || X.status === 0) {
            kernelSource = X.responseText;
        }
        return kernelSource;
    }


    /* create new worker with external script */
    function createWorker(url) {
        var src;
        var mHttpReq = new XMLHttpRequest();
        mHttpReq.open("GET", url, false);
        mHttpReq.send(null);
        src = mHttpReq.responseText;

        var blob = new Blob([src], {type: "text/javascript"});
        var worker = new Worker(window.URL.createObjectURL(blob));
        return worker;
    }

    function isInt(n) {
        // return typeof n === "number" && n % 1 == 0;
        return n % 1 == 0;
    }

    function getChunkSize(c) {
        if (c > maxWorkGroupSize)
            return parseInt(c/maxWorkGroupSize) * maxWorkGroupSize;
        return parseInt(c);
    }

    function getChunkSizeCeil(c) {
        if (c > maxWorkGroupSize)
            return Math.ceil(c/maxWorkGroupSize) * maxWorkGroupSize;
        return parseInt(c);
    }

    function toStr(script) {
        var funcStr = script.toString();
        var scriptArgs = funcStr.substring(funcStr.indexOf('(')+1,
        funcStr.indexOf(')')).split(',');
        var scriptBody = funcStr.substring(funcStr.indexOf('{')+1, funcStr.lastIndexOf('}'));
        return {args:scriptArgs, body:scriptBody};
    }
}
