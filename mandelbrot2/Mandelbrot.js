function Mandelbrot(result, width, height, maxIterations, zoomFactor) {
    var y = get_global_id(0);
    var row = parseInt(y/width);
    var col = y % width;

    var Cr = ((col/width)-0.5)/zoomFactor*2.0-0.73;
    var Ci = ((row/height)-0.5)/zoomFactor*2.0-0.237;
    var I = 0, R = 0, I2 = 0, R2 = 0;
    var n = 0;

    while ((R2+I2 < 2.0) && (n < maxIterations)) {
        I = (R+R)*I+Ci;
        R = R2-I2+Cr;
        R2 = R*R;
        I2 = I*I;
        n++;
    } 
    result[row*width+col] = n;
}


