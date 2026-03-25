import React, { useState, useEffect, useRef } from 'react';
import { GoogleGenAI, LiveServerMessage, Modality } from '@google/genai';
import { Mic, MicOff, Loader2, Volume2 } from 'lucide-react';
import { Button } from './ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from './ui/card';

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

export function LiveAudioAssistant({ contextText }: { contextText: string }) {
  const [isConnecting, setIsConnecting] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  
  const sessionRef = useRef<any>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const activeSourcesRef = useRef<AudioBufferSourceNode[]>([]);
  const nextPlayTimeRef = useRef<number>(0);

  const connect = async () => {
    setIsConnecting(true);
    try {
      audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 16000 });
      
      const sessionPromise = ai.live.connect({
        model: "gemini-2.5-flash-native-audio-preview-12-2025",
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: {
            voiceConfig: { prebuiltVoiceConfig: { voiceName: "Zephyr" } },
          },
          systemInstruction: `You are a helpful legal assistant. The user is currently looking at a case with the following context:\n\n${contextText}\n\nAnswer their questions concisely and professionally.`,
        },
        callbacks: {
          onopen: async () => {
            try {
              const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
              streamRef.current = stream;
              const source = audioContextRef.current!.createMediaStreamSource(stream);
              const processor = audioContextRef.current!.createScriptProcessor(4096, 1, 1);
              
              processor.onaudioprocess = (e) => {
                const channelData = e.inputBuffer.getChannelData(0);
                const pcm16 = new Int16Array(channelData.length);
                for (let i = 0; i < channelData.length; i++) {
                  pcm16[i] = Math.max(-1, Math.min(1, channelData[i])) * 0x7FFF;
                }
                const base64 = btoa(String.fromCharCode(...new Uint8Array(pcm16.buffer)));
                sessionPromise.then(session => {
                  session.sendRealtimeInput({ audio: { data: base64, mimeType: 'audio/pcm;rate=16000' } });
                });
              };

              source.connect(processor);
              processor.connect(audioContextRef.current!.destination);
              processorRef.current = processor;
              
              setIsConnected(true);
              setIsConnecting(false);
            } catch (err) {
              console.error("Mic error", err);
              setIsConnecting(false);
            }
          },
          onmessage: (message: LiveServerMessage) => {
            if (message.serverContent?.interrupted) {
              activeSourcesRef.current.forEach(s => {
                try { s.stop(); } catch(e) {}
              });
              activeSourcesRef.current = [];
              if (audioContextRef.current) {
                nextPlayTimeRef.current = audioContextRef.current.currentTime;
              }
              setIsSpeaking(false);
            }

            const base64Audio = message.serverContent?.modelTurn?.parts[0]?.inlineData?.data;
            if (base64Audio && audioContextRef.current) {
              setIsSpeaking(true);
              const binaryString = atob(base64Audio);
              const bytes = new Uint8Array(binaryString.length);
              for (let i = 0; i < binaryString.length; i++) {
                bytes[i] = binaryString.charCodeAt(i);
              }
              const pcm16 = new Int16Array(bytes.buffer);
              const audioBuffer = audioContextRef.current.createBuffer(1, pcm16.length, 24000);
              const channelData = audioBuffer.getChannelData(0);
              for (let i = 0; i < pcm16.length; i++) {
                channelData[i] = pcm16[i] / 0x7FFF;
              }

              const source = audioContextRef.current.createBufferSource();
              source.buffer = audioBuffer;
              source.connect(audioContextRef.current.destination);
              
              let playTime = nextPlayTimeRef.current;
              if (playTime < audioContextRef.current.currentTime) {
                playTime = audioContextRef.current.currentTime;
              }
              source.start(playTime);
              nextPlayTimeRef.current = playTime + audioBuffer.duration;
              
              activeSourcesRef.current.push(source);
              source.onended = () => {
                activeSourcesRef.current = activeSourcesRef.current.filter(s => s !== source);
                if (activeSourcesRef.current.length === 0) {
                  setIsSpeaking(false);
                }
              };
            }
          },
          onclose: () => {
            disconnect();
          },
          onerror: (err) => {
            console.error("Live API Error:", err);
            disconnect();
          }
        }
      });
      
      sessionRef.current = await sessionPromise;
    } catch (err) {
      console.error("Connection error", err);
      setIsConnecting(false);
    }
  };

  const disconnect = () => {
    if (processorRef.current) {
      processorRef.current.disconnect();
      processorRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
      streamRef.current = null;
    }
    if (audioContextRef.current) {
      audioContextRef.current.close();
      audioContextRef.current = null;
    }
    activeSourcesRef.current.forEach(s => {
      try { s.stop(); } catch(e) {}
    });
    activeSourcesRef.current = [];
    if (sessionRef.current) {
      try { sessionRef.current.close(); } catch(e) {}
      sessionRef.current = null;
    }
    setIsConnected(false);
    setIsConnecting(false);
    setIsSpeaking(false);
  };

  useEffect(() => {
    return () => disconnect();
  }, []);

  return (
    <Card className="bg-blue-50 border-blue-200 shadow-sm">
      <CardHeader className="pb-3">
        <CardTitle className="text-lg flex items-center text-blue-900">
          <Volume2 className="w-5 h-5 mr-2" />
          Live Voice Assistant
        </CardTitle>
        <CardDescription className="text-blue-700">
          Have a real-time voice conversation about your case.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {!isConnected ? (
          <Button 
            onClick={connect} 
            disabled={isConnecting}
            className="w-full bg-blue-600 hover:bg-blue-700 text-white"
          >
            {isConnecting ? (
              <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Connecting...</>
            ) : (
              <><Mic className="w-4 h-4 mr-2" /> Start Voice Chat</>
            )}
          </Button>
        ) : (
          <div className="flex flex-col items-center space-y-4">
            <div className="flex items-center justify-center w-16 h-16 rounded-full bg-blue-200 animate-pulse">
              {isSpeaking ? <Volume2 className="w-8 h-8 text-blue-700" /> : <Mic className="w-8 h-8 text-blue-700" />}
            </div>
            <p className="text-sm font-medium text-blue-800">
              {isSpeaking ? "Assistant is speaking..." : "Listening..."}
            </p>
            <Button 
              onClick={disconnect}
              className="w-full bg-red-600 hover:bg-red-700 text-white"
            >
              <MicOff className="w-4 h-4 mr-2" /> End Conversation
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
