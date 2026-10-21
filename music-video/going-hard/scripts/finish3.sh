set -e
SONG=song.wav
enc(){ t=$1; name=$2
  until [ -f chunks_$t/ALLDONE ]; do sleep 20; done
  ls chunks_$t/c_*.mp4 | sed "s#^#file '$PWD/#; s#\$#'#" > list_$t.txt
  ffmpeg -v error -y -f concat -safe 0 -i list_$t.txt -c copy video_$t.mp4
  ffmpeg -v error -y -i video_$t.mp4 -i $SONG -map 0:v -map 1:a -t 122.08 -c:v libx264 -preset slow -crf 19 -maxrate 12M -bufsize 24M -pix_fmt yuv420p -c:a aac -b:a 320k -ar 48000 -movflags +faststart out/$name.mp4
  ffmpeg -v error -y -i out/$name.mp4 -c:v libx264 -preset slow -b:v 2600k -pass 1 -passlogfile pl_$t -an -f mp4 /dev/null
  ffmpeg -v error -y -i out/$name.mp4 -c:v libx264 -preset slow -b:v 2600k -maxrate 5M -bufsize 10M -pass 2 -passlogfile pl_$t -pix_fmt yuv420p -c:a aac -b:a 192k -movflags +faststart share/$name-share.mp4
  echo "$t ENCODED"; }
enc land going-hard-16x9 &
( enc vert going-hard-9x16 && ffmpeg -v error -y -ss 59.2 -t 30 -i out/going-hard-9x16.mp4 -vf "fade=in:0:8,fade=out:st=29:d=1" -af "afade=in:d=0.3,afade=out:st=28.5:d=1.5" -c:v libx264 -preset slow -crf 19 -maxrate 12M -bufsize 24M -pix_fmt yuv420p -c:a aac -b:a 320k -movflags +faststart out/going-hard-30s-9x16.mp4 && echo CLIP ENCODED ) &
wait; echo FINISHED
