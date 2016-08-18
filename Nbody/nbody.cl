__kernel void __attribute__((vec_type_hint(float4))) nbody(
        __global const float4* curPos,
        __global const float4* curVel,
        int numBodies,
        float deltaTime,
        int epsSqr,
        // int bodyCountPerGroup,
        __global float4* nxtPos,
        __global float4* nxtVel
        )
{

    int index = get_global_id(0);
    int i, k, l;

    // int start = index * bodyCountPerGroup + offset;
    int start = index;
    // printf("start: %d\t%d\n", start, index);

    float4 myPos, aLocalPos, acc, oldVel, newPos, newVel, r;
    float inverse_distance, s, distSqr;

    // for (l = 0; l < bodyCountPerGroup; l++) {
    l = 0;
        k = l+start;//4*(l + start);
        myPos = curPos[k];
        acc = (float4) (0,0,0,0);
#pragma unroll
        for (i = 0; i < numBodies; i++) {
            aLocalPos = curPos[i];
            r = aLocalPos - myPos;

            distSqr = r.x*r.x + r.y*r.y + r.z*r.z;
            inverse_distance = native_rsqrt(distSqr + epsSqr);
            s = aLocalPos.w * inverse_distance * inverse_distance * inverse_distance;
            acc += s*r;
        }

        oldVel = curVel[k];
        newPos = myPos + oldVel*deltaTime + acc*(0.5f*deltaTime*deltaTime);
        newVel = oldVel + acc*deltaTime;
        newPos.w = myPos.w;


        // check boundry
        if (newPos.x > 1.0f
                || newPos.x < -1.0f
                || newPos.y > 1.0f
                || newPos.y < -1.0f
                || newPos.z > 1.0f
                || newPos.z < -1.0f) {
            float rand = (1.0f * k) / numBodies;
            float r = 0.05f *  rand;
            float theta = rand;
            float phi = 2 * rand;
            newPos.x = r * sinpi(theta) * cospi(phi);
            newPos.y = r * sinpi(theta) * sinpi(phi);
            newPos.z = r * cospi(theta);
            newVel.x = 0.0f;
            newVel.y = 0.0f;
            newVel.z = 0.0f;
        }

        // write to global memory
        nxtPos[index] = newPos;
        nxtVel[index] = newVel;

    // }
}
