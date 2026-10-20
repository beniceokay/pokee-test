import librosa,numpy as np,json
y,sr=librosa.load('song.mp3',sr=22050,mono=True)
tempo,beats=librosa.beat.beat_track(y=y,sr=sr,units='time',tightness=400)
oenv=librosa.onset.onset_strength(y=y,sr=sr)
# downbeats: choose phase of 4 with max low-freq onset
S=np.abs(librosa.stft(y,n_fft=2048,hop_length=512));freqs=librosa.fft_frequencies(sr=sr)
low=librosa.onset.onset_strength(S=librosa.amplitude_to_db(S[freqs<150]),sr=sr)
bf=librosa.time_to_frames(beats,sr=sr)
ph=max(range(4),key=lambda p:low[bf[p::4]].mean())
downs=beats[ph::4]
rms=librosa.feature.rms(y=y)[0];t=librosa.times_like(rms,sr=sr)
sec=[float(np.sqrt(np.mean(y[int(s*sr):int((s+1)*sr)]**2))) for s in range(int(len(y)/sr))]
# kicks: strong low onsets
pk=librosa.util.peak_pick(low,pre_max=3,post_max=3,pre_avg=10,post_avg=10,delta=np.percentile(low,90)*0.5,wait=5)
kicks=librosa.frames_to_time(pk,sr=sr)
json.dump({'tempo':float(np.atleast_1d(tempo)[0]),'beats':[round(float(b),3) for b in beats],'downbeats':[round(float(b),3) for b in downs],'kicks':[round(float(k),3) for k in kicks],'rms_per_sec':[round(20*np.log10(v+1e-9),1) for v in sec]},open('analysis.json','w'))
print('tempo',tempo,'beats',len(beats),'first beats',beats[:6],'phase',ph)
print('downbeats first',downs[:5])
r=[round(20*np.log10(v+1e-9)) for v in sec]
for i in range(0,len(r),8): print(i, r[i:i+8])
