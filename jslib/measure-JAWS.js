function JAWS(nCPU) {

    /* Attribute */
    this.initRate = 0.002;          // intial chunk
    this.merge = [0];
    this.SIMD = false;
    this.ext = null;
    this.debug = true;
    this.useCPU = true;
    this.useGPU = true;

	/* Configurations */
    var numCPU = 10;                // number of CPU cores
	var growthRate = 1.5;
    var maxWorkGroupSize = 1024;    // maximum Work Group Size for GPU
	var minSlope = -0.05;
    var maxSlope = 0.05;
    var useShare = true;           	// true: use sharedData, false: not use
    var OPT = true;                 // true: dynamic chunk size, false: static chunk size;

    /* Global variables */
    var done;                       // completed items
    var offset;                     // next item index
    var DATA_SIZE;                  // total data size for chunking
    var ext;                        // external function
    var opt = OPT;                  // true: dynamic chunk size, false: static chunk size;
    var PATH = "../../jslib/";
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
        this.chunkSize = new Array();

        this.push = function(thruput, time) {
            // if (this.Thruput.length == WindowSize) {
            //     this.Thruput.shift();
            //     this.Time.shift();
            // }
            this.Thruput.push(thruput);
            this.Time.push(time);
        };

        this.getSlope = function() {
			var slope;
            var len = this.Thruput.length;
            if(len >= WindowSize){
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
        this.argShare = new Array();
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
        this.coreEnd = new Array(numCPU);
        this.coreStart = new Array(numCPU);
        for (var j=0; j<numCPU; j++) {
            this.coreEnd[j] = new Array();
            this.coreStart[j] = new Array();
        }
        this.cpuEnd = [];
        this.done = 0;
        this.time = 0;
        this.thruput = 0;
        this.scheduler = new Scheduler();

        var worker = new Array();
        for (var i=0; i<numCPU; i++) {
            worker[i] = createWorker(PATH+"measure-workerCPU.js");
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
        this.setSharedFloat32 = function(array, index) {
            for (var i=0; i<numCPU; i++) {
                worker[i].setSharedFloat32(array, index);
            }
        };

        this.setSharedUint8 = function(array, index) {
            for (var i=0; i<numCPU; i++) {
                worker[i].setSharedUint8(array, index);
            }
        };

        this.setSharedUint8C = function(array, index) {
            for (var i=0; i<numCPU; i++) {
                worker[i].setSharedUint8C(array, index);
            }
        };

        this.init = function(func, type, nshare, merge) {
            for (var i=0; i<numCPU; i++) {
                worker[i].postMessage({mode: "init", func: func, argType: type, argNShare: nshare, useShare: useShare, merge: merge, SIMD: that.SIMD});
            }
        };

        this.run = function() {
            start = timer.getTime();
            if (CPU.chunkSize > 0) {
                var chunkSizePerCore = parseInt(CPU.chunkSize / numCPU);
                if (chunkSizePerCore > 0) {
                    CPU.scheduler.chunkSize.push(chunkSizePerCore*numCPU);
                    for (var i=0; i<numCPU; i++) {
						worker[i].postMessage({mode: "run", core: i, offset: offset, chunkSize: chunkSizePerCore});
                        offset += chunkSizePerCore;
                    }
                } else {
                    CPU.scheduler.chunkSize.push(DATA_SIZE - offset);
                    for (var i=0; i<numCPU; i++) {
                        if ((DATA_SIZE - offset) >= 1) chunkSizePerCore = 1;
                        else chunkSizePerCore = 0;
						worker[i].postMessage({mode: "run", core: i, offset: offset, chunkSize: chunkSizePerCore});
                        offset += chunkSizePerCore;
                    }
                }
            }
        };

        /* CPU onmessage */
        function onMsg(e) {
            var chunkSize = e.data.chunkSize;
            var slope;
            var core = e.data.core;

            done += chunkSize;
            CPU.done += chunkSize;
            CPU.coreEnd[core].push((timer.getTime() - timer.start-2000));
            CPU.coreStart[core].push((start - timer.start-2000));

            if (useShare === false) {
                var jid = job.complete;
                for (var i in e.data.output) {
                    job.argNShare[jid][job.merge[jid][i]].set(e.data.output[i], e.data.offset);
                }
            }

            wait ++;
            if (wait == numCPU) {
                wait = 0;
                // debug("CPU end");
                end = timer.getTime();
                CPU.cpuEnd.push(end - timer.start-2000);
                CPU.time += end - start;
                CPU.thruput = CPU.done/CPU.time;
                CPU.scheduler.push(CPU.thruput, end);

                if (opt) {
                    if(GPU.thruput != 0 && (DATA_SIZE - offset) > DATA_SIZE*0.1){
                        var slope = CPU.scheduler.getSlope();
                        if (slope > minSlope && slope < maxSlope) {
                            opt = false;
                            var partition = parseInt((DATA_SIZE - offset) * (GPU.thruput / (CPU.thruput + GPU.thruput)));
                            if(partition > 0){
                                GPU.chunkSize = partition;
                                GPU.chunkSize = getChunkSize(GPU.chunkSize); 
                            }
                            if(DATA_SIZE - offset - GPU.chunkSize > 0)
                                CPU.chunkSize = DATA_SIZE - offset - GPU.chunkSize;
                            debug("ccccc");
                            debug("cpuSlope:  "+slope);
                            debug("DATA_SIZE - offset: "+(DATA_SIZE - offset));
                            debug("CPU.thruput:  "+CPU.thruput);
                            debug("GPU.thruput:  "+GPU.thruput);
                            debug("CPU.chunkSize:  "+CPU.chunkSize);
                            debug("GPU.chunkSize:  "+GPU.chunkSize);
                        } 
                    	else {
                        	CPU.chunkSize = parseInt(CPU.chunkSize * growthRate);
                        	//CPU.chunkSize = CPU.chunkSize + growthSize;
                    	}
                    }
                    else {
						CPU.chunkSize = parseInt(CPU.chunkSize * growthRate);
                        //CPU.chunkSize = CPU.chunkSize + growthSize;
                    }
                }
                
                // debug("CPU thruput: " + CPU.thruput + " , chunkSize " + CPU.chunkSize);

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


    /* GPU worker */
    var GPU = new function() {
        this.chunkSize;
        var wait = 0;
        var start = 0;
        var end = 0;
        this.done = 0;
        this.time = 0;
        this.thruput = 0;
        this.scheduler = new Scheduler();

        this.gpuEnd = [];
        this.gpuStart = [];

        var worker = createWorker(PATH+"workerGPU.js");
        worker.onmessage = onMsg;
        worker.onerror = function(e) {
            throw e.message + " @ workerGPU.js:" + e.lineno;
        };

        this.setSharedFloat32 = function(array, index) {
            worker.setSharedFloat32(array, index);
        };

        this.setSharedUint8 = function(array, index) {
            worker.setSharedUint8(array, index);
        };

        this.setSharedUint8C = function(array, index) {
            worker.setSharedUint8C(array, index);
        };

		this.init = function(kernel, type, nshare, merge, kernelName) {
            worker.postMessage({mode: "init", kernel: kernel, argType: type, argNShare: nshare, useShare: useShare, merge: merge, SIMD: that.SIMD, kernelName: kernelName});
        };

        this.run = function() {
            // debug("GPU start");
            start = timer.getTime();
            // debug("GPU run: " + offset + ", " + this.chunkSize + ", " + DATA_SIZE);
            if (GPU.chunkSize > 0) {
                GPU.scheduler.chunkSize.push(GPU.chunkSize);
                worker.postMessage({mode: "run", offset: offset, chunkSize: GPU.chunkSize});
                offset += GPU.chunkSize;
            }
        };

        /* GPU onmessage */
        function onMsg(e) {
            var chunkSize = e.data.chunkSize;
            done += chunkSize;
            GPU.done += chunkSize;

            if (useShare === false) {
                var jid = job.complete;
                for (var i in e.data.output) {
                    job.argNShare[jid][job.merge[jid][i]].set(e.data.output[i], e.data.offset);
                }
            }

            // debug("GPU end");
            end = timer.getTime();
            GPU.time += end - start;
            GPU.thruput = GPU.done/GPU.time;
            GPU.scheduler.push(GPU.thruput, end);

            GPU.gpuEnd.push((timer.getTime() - timer.start-2000));
            GPU.gpuStart.push((start - timer.start-2000));

            if (opt) {
				if(CPU.thruput != 0 && (DATA_SIZE - offset) > DATA_SIZE*0.1){
                    var slope = GPU.scheduler.getSlope();
                    if (slope > minSlope && slope < maxSlope) {
                        opt = false;
                        var partition = parseInt((DATA_SIZE - offset) * (GPU.thruput / (CPU.thruput + GPU.thruput)));
                        if(partition > 0){
                            GPU.chunkSize = partition;
                            GPU.chunkSize = getChunkSize(GPU.chunkSize); 
                        }
                        if(DATA_SIZE - offset - GPU.chunkSize > 0)
                            CPU.chunkSize = DATA_SIZE - offset - GPU.chunkSize;
                        debug("ggggg");
                        debug("gpuSlope:  "+slope);
                        debug("DATA_SIZE - offset: "+(DATA_SIZE - offset));
                        debug("CPU.thruput:  "+CPU.thruput);
                        debug("GPU.thruput:  "+GPU.thruput);
                        debug("CPU.chunkSize:  "+CPU.chunkSize);
                        debug("GPU.chunkSize:  "+GPU.chunkSize);
                    } 
                	else {
                    	GPU.chunkSize = parseInt(GPU.chunkSize * growthRate);
                    	//GPU.chunkSize = GPU.chunkSize + growthSize;
                	}
                }
                else {
                    GPU.chunkSize = parseInt(GPU.chunkSize * growthRate);
                    //GPU.chunkSize = GPU.chunkSize + growthSize;
                }
            }
            // debug("GPU thruput: " + GPU.thruput + " , chunkSize " + GPU.chunkSize);

            GPU.chunkSize = getChunkSizeCeil(GPU.chunkSize);
            if (DATA_SIZE - offset >= GPU.chunkSize) {
                GPU.run();

            } else if (DATA_SIZE - offset > 0) {
                GPU.chunkSize = getChunkSize(DATA_SIZE - offset);
                GPU.run();

            } else if (done == DATA_SIZE) {
                finishJob();
            }
        }
    }


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
        var argShare = new Array();
        var argNShare = new Array();

        for (var i in args) {
            var val = args[i];

            if (val instanceof Float32Array) {
                if (useShare) {
                    argType.push("shareFloat32");
                    argShare.push(val);
                } else {
                    argType.push("typedArray");
                    argNShare.push(val);
                }

            } else if (val instanceof Uint8ClampedArray) {
                if (useShare) {
                    argType.push("shareUint8C");
                    argShare.push(val);
                } else {
                    argType.push("typedArray");
                    argNShare.push(val);
				}

			} else if (val instanceof Uint8Array) {
                if (useShare) {
                    argType.push("shareUint8");
                    argShare.push(val);
                } else {
                    argType.push("typedArray");
                    argNShare.push(val);
                }

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
        job.argShare[index]     = argShare;
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
        debug("GPU works: " + GPU.time + " ms (" + GPU.done + " elements)");
        
		console.log("CPUthput: "+CPU.scheduler.Thruput);
        console.log("GPUthput: "+GPU.scheduler.Thruput);

        console.log("CPUchunkSize: "+CPU.scheduler.chunkSize);
        console.log("GPUchunkSize: "+GPU.scheduler.chunkSize);

        console.log("CPUprofileQuantum: "+CPU.cpuEnd);
        console.log("GPUprofileQuantum: "+GPU.gpuEnd);

        for (var i=0; i<numCPU; i++) {
        	console.log("C"+i+" S: "+CPU.coreStart[i]);
            console.log("C"+i+" E: "+CPU.coreEnd[i]);
        }
        console.log("G"+" S: "+GPU.gpuStart);
        console.log("G"+" E: "+GPU.gpuEnd);

        if (ext != null) {
			//debug("DONE: " + (time-2000) + " ms");
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

        if ((i > 0) && (job.id[i] == job.id[i-1]) && that.useGPU && that.useCPU) {
			var factor;

//			if ((Math.max(CPU.thruput, GPU.thruput) > Math.min(CPU.thruput, GPU.thruput) * 10) && balanced)
			if (CPU.scheduler.getSlope() < maxSlope || GPU.scheduler.getSlope() < maxSlope) {
				factor = 0.5;
				opt = false;
			} else {
				factor = 0.01;
				opt = OPT;
			}

            GPU.chunkSize = getChunkSizeCeil((DATA_SIZE * factor) * GPU.thruput / (CPU.thruput + GPU.thruput));
            CPU.chunkSize = parseInt(DATA_SIZE * factor - GPU.chunkSize);
        } else {
            var chunkSize = getChunkSize(DATA_SIZE * that.initRate);
 
            if (that.useGPU)
                GPU.chunkSize = chunkSize;
            else
                GPU.chunkSize = 0;

            CPU.chunkSize = chunkSize;
            if (((DATA_SIZE - GPU.chunkSize) < CPU.chunkSize))
                CPU.chunkSize = DATA_SIZE - GPU.chunkSize;

			opt = OPT;
        }


        CPU.scheduler = new Scheduler();
        CPU.thruput = 0;
        GPU.scheduler = new Scheduler();
        GPU.thruput = 0;
            
		CPU.coreEnd = new Array(numCPU);
        CPU.coreStart = new Array(numCPU);
        for (var j=0; j<numCPU; j++) {
            CPU.coreEnd[j] = new Array();
            CPU.coreStart[j] = new Array();
        }

        CPU.cpuStart = [];
        CPU.cpuEnd = [];
        GPU.gpuStart = [];
        GPU.gpuEnd = [];
        //}
        CPU.time = 0;
        CPU.done = 0;
        
        GPU.time = 0;
        GPU.done = 0;

        if (useShare)
            shareTypedArray(job.argShare[i]);
		
		if (that.useGPU) {
            GPU.init(job.CL[i], job.argType[i], job.argNShare[i], job.merge[i], job.id[i]);
            GPU.run();
        }

        if (that.useCPU) {
            CPU.init(job.JS[i], job.argType[i], job.argNShare[i], job.merge[i]);
            CPU.run();
		}
	}

    function shareTypedArray(array) {
        var shareFloat32 = 0;
        var shareUint8 = 0;
        var shareUint8c = 0;
        for (var i in array) {
            if (array[i] instanceof Float32Array) {
                CPU.setSharedFloat32(array[i], shareFloat32);
                GPU.setSharedFloat32(array[i], shareFloat32);
                shareFloat32++;

            } else if (array[i] instanceof Uint8ClampedArray) {
                CPU.setSharedUint8C(array[i], shareUint8c);
                GPU.setSharedUint8C(array[i], shareUint8c);
                shareUint8c++;

            } else if (array[i] instanceof Uint8Array) {
                CPU.setSharedUint8(array[i], shareUint8c);
                GPU.setSharedUint8(array[i], shareUint8c);
                shareUint8++;
            }
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
