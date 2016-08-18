int iClamp(int i)
{
    return min(max(0, i), 255);
}

__kernel void ckManZ2sm(__global uchar4* col,
        float scale, float Ro, float Io, int width){

    int xx = get_global_id(0);
    int y = (int)(xx/width);
    int x = (xx % width);
    int maxIter = 65536;
    // ushort x = get_global_id(0),  y = get_global_id(1);


    float Cr = (x - 256) * scale + Ro,  Ci = -(y - 256) * scale + Io;
    float I=0.0f, R=0.0f,  I2=0.0f, R2=0.0f;
    int n=0;
    while ( (R2+I2 < 100.0f) && (n < maxIter) ){
        I=(R+R)*I+Ci;  R=R2-I2+Cr;  R2=R*R;  I2=I*I;  n++;
    }

    if (n == maxIter) {
        col[y*width + x] = (uchar4)(0, 0, 0, 255);
        // col[(y*width + x)*4] = 0;
        // col[(y*width + x)*4 + 1] = 0;
        // col[(y*width + x)*4 + 2] = 0;
        // col[(y*width + x)*4 + 3] = 255;
    } else {
        float cx = 1.4427f*(log(log(R2+I2)) - 1.52718f);
        int c = (int)(((n % 64) - cx)*24.0f);

        // col[(y*width + x)*4] =     iClamp((int)abs(c - 768) - 384);
        // col[(y*width + x)*4 + 1] = iClamp(512 - (int)abs(c - 512));
        // col[(y*width + x)*4 + 2] = iClamp(512 - (int)abs(c - 1024));
        // col[(y*width + x)*4 + 3] = 255;

        col[y*width + x] = (uchar4)(
        iClamp( (int)abs(c - 768) - 384 ),
        iClamp( 512 - (int)abs(c - 512) ),
        iClamp( 512 - (int)abs(c - 1024) ),
        255);
    }
}

