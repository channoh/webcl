function nbody(curPos, curVel, NBODY, DT, EPSSQR, nxtPos, nxtVel) {
    var i = get_global_id(0);
    _nbody(curPos, curVel, NBODY, DT, EPSSQR, nxtPos, nxtVel, i);
}
