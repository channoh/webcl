var colorMapW = [
 66,  30,  15,
 25,   7,  26,
  9,   1,  47,
  4,   4,  73, 
  0,   7, 100, 
 12,  44, 138,
 24,  82, 177,
 57, 125, 209,
134, 181, 229,
211, 236, 248,
241, 233, 191,
248, 201,  95,
255, 170,   0,
204, 128,   0,
153,  87,   0,
106,  52,   3];

var maxIterations = 512;
var zoomFactor = 1.01;
var nc = 30, maxCol = nc*3, cr,cg,cb;
var numFrames = 0;
var elapsed = 0;
var prevTime = 0;
var width, height;
var canvas, ctx, imgData;

function startFPSDisplay() {
    var fps = "--"
    if(numFrames != 0) {
        fps = Math.round((numFrames*1000)/elapsed) + " fps";
    }
    document.getElementById("fps-display").innerHTML = fps; 
    setTimeout(function() {startFPSDisplay();}, 1000);
}

function writeResult (data) {
    var c = 0; var ic;
    var r, g, b;
    var i = 0; var color; var ic;
    var len; 
    var pix = imgData.data;

    len = data.length;
    for (var t = 0; t < len; t++) {
        var n = data[t];
        if(n >= maxIterations) {
            r = g = b = 0;
        }
        else {
            color = n % 16;
            r = colorMapW[color*3];
            g = colorMapW[color*3+1];
            b = colorMapW[color*3+2];
        }
        pix[c++] = r;
        pix[c++] = g;
        pix[c++] = b;
        pix[c++] = 255;
    }
    ctx.putImageData(imgData, 0, 0);
}

function computeFrame() {
    if(numFrames == 0) {
        prevTime = Date.now();
    }
    else if(numFrames > 0) {
        var curTime = Date.now();
        elapsed +=  curTime - prevTime;
        prevTime = curTime;
    }
    setTimeout(function() {computeFrame();}, 20);
}
