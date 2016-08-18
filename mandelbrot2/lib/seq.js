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
var nc = 30, maxCol = nc*3, cr,cg,cb;
var numFrames = 0;
var elapsed = 0;
var prevTime = 0;
var width, height;
var canvas, ctx, imgData;
var zoomFactor = 1.01;

function startFPSDisplay() {
    var fps = "--"
    if(numFrames != 0) {
        fps = Math.round((numFrames*1000)/elapsed) + " fps";
    }
    document.getElementById("fps-display").innerHTML = fps; 
    setTimeout(function() {startFPSDisplay();}, 100);
}

function doMandelBrotSequential() {
    if(numFrames === 0) {
        prevTime = Date.now();
    }
    else if(numFrames > 0) {
        var curTime = Date.now();
        elapsed +=  curTime - prevTime;
        prevTime = curTime;
    }
    var mandelbrot = computeSetSequential(zoomFactor, maxIterations);
    //var mandelbrot = webkitSequential(scale, Ro, Io);  //webkit
    writeResult(mandelbrot);
    numFrames++;
    zoomFactor *= 1.01;
    setTimeout(function() {doMandelBrotSequential();}, 0);
}

function webkitSequential(scale, Ro, Io) {
    var numPoints = width*height;
    var result = new Array(numPoints);
    for(var x = 0; x < width; x++) {
        for(var y = 0; y < height; y++) {
            var Cr = (x - 256) * scale + Ro;
            var Ci = -(y - 256) * scale + Io;
            var I = 0, R = 0, I2 = 0, R2 = 0;
            var n = 0;
            while ((R2+I2 < 4.0) && (n < 1024)) {
                I = (R+R)*I+Ci;
                R = R2-I2+Cr;
                R2 = R*R;
                I2 = I*I;
                n++;
            } 
            result[y*512 + x] = n;
        }
    }
    return result;
}


// Sequential version
function computeSetSequential(zoomFactor, maxIterations) {
    var numPoints = width*height;
    var result = new Array(numPoints);
    for(var x = 0; x < width; x++) {
        for(var y = 0; y < height; y++) {
            var Cr = ((x/width)-0.5)/zoomFactor*2.0-0.73;
            var Ci = ((y/height)-0.5)/zoomFactor*2.0-0.237;
            var I = 0, R = 0, I2 = 0, R2 = 0;
            var n = 0;
            while ((R2+I2 < 2.0) && (n < maxIterations)) {
                I = (R+R)*I+Ci;
                R = R2-I2+Cr;
                R2 = R*R;
                I2 = I*I;
                n++;
            } 

            result[y*width+x] = n;
        }
    }
    return result;
}

function writeResult (m) {
    var c = 0; var ic;
    var r, g, b;
    var i = 0; var color; var ic;
    var data, len; 
    var pix = imgData.data;
    
    data = m;

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
