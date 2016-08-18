__kernel
void Mandelbrot( __global float* result,
                 const int width,
                 const int height,
                 const int maxIterations,
                 const float zoomFactor)
{
    int y = get_global_id(0);
    int row = (int)(y/width);
    int col = y % width;

    float Cr = ((col/(float)width)-0.5)/zoomFactor*2.0-0.73;
    float Ci = ((row/(float)height)-0.5)/zoomFactor*2.0-0.237;
    float I=0.0f, R=0.0f,  I2=0.0f, R2=0.0f;
    int n=0;

    while ((R2+I2 < 2.0) && (n < maxIterations)) {
        I=(R+R)*I+Ci;
        R=R2-I2+Cr;
        R2=R*R;
        I2=I*I;
        n++;
    }
    result[row*width+col] = n;
}
