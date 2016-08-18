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

    /* Measurement */
    var cpuExe = 0;
    var cpuEnd = 0;

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


	function Scheduler() {
		var WindowSize = 5;
        this.Thruput = new Array();
        this.Time = new Array();

        this.push = function(thruput, time) {
            if (this.Thruput.length == WindowSize) {
                this.Thruput.shift();
                this.Time.shift();
            }
            this.Thruput.push(thruput);
            this.Time.push(time);
        };

        this.getSlope = function() {
			var slope;
            var len = this.Thruput.length;
            if(len == WindowSize){
                var slope1 = (this.Thruput[len-1]-this.Thruput[len-2]) / (this.Time[len-1]-this.Time[len-2]);
                var slope2 = (this.Thruput[len-2]-this.Thruput[len-3]) / (this.Time[len-2]-this.Time[len-3]);
                var slope3 = (this.Thruput[len-3]-this.Thruput[len-4]) / (this.Time[len-3]-this.Time[len-4]);
                var slope4 = (this.Thruput[len-4]-this.Thruput[len-5]) / (this.Time[len-4]-this.Time[len-5]);
                slope = (slope1+slope2+slope3+slope4)/4;
            }
            else{
                slope = -100;
            }

            return slope;
        };

    }

    /* Object for measuring time */
    var timer = new function() {
        // var obj = new Date();
        this.start;
        this.end;
        this.getTime = function() {
            // return obj.gettimeofday();
            return window.performance.now();
        };
    };


    /* Stopwatch start */
    timer.start = timer.getTime();


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
        this.time = 0;
        this.thruput = 0;
        this.scheduler = new Scheduler();

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
            start = timer.getTime();
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
                // debug("CPU end");
                end = timer.getTime();
                cpuEnd = end;
                CPU.time += end - start;
                CPU.thruput = CPU.done/CPU.time;
                CPU.scheduler.push(CPU.thruput, end);

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
        timer.end = timer.getTime();
        var time = timer.end - timer.start;
        // debug("DONE: " + (time-2000) + " ms");
        debug("CPU works: " + CPU.time + " ms (" + CPU.done + " elements)");
        cpuExe += CPU.time;

        if (ext != null) {
			debug("DONE: " + (time-2000) + " ms");
            debug("cpuExe: " + cpuExe + " ms");
            debug("cpuEnd: " + cpuEnd + " ms");
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

        CPU.scheduler = new Scheduler();
        CPU.thruput = 0;
        CPU.chunkSize = 1024;

        CPU.time = 0;
        CPU.done = 0;
        
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
