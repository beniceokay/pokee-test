#!/bin/bash
# usage: renderall.sh W H tag
W=$1; H=$2; TAG=$3; mkdir -p chunks_$TAG
for s in $(seq 0 20 240); do
  e=$((s+20)); [ $e -gt 244 ] && e=244
  out=chunks_$TAG/c_$(printf %03d $s).mp4
  [ -s $out.done ] && continue
  NODE_PATH=$(npm root -g) node prender.js $W $H 24 $s $e $out > chunks_$TAG/log_$s.txt 2>&1 && touch $out.done
done
echo ALLDONE > chunks_$TAG/ALLDONE
