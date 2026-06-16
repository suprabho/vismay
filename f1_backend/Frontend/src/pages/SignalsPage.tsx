/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import { Circle, AlertTriangle, Zap as ZapIcon, Loader2 } from 'lucide-react';
import { signalsApi } from '../config/api';
import { Signal } from '../types';

export function SignalsPage() {
  const [signals, setSignals] = useState<Signal[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState('');

  useEffect(() => {
    async function load() {
      try {
        const res = await signalsApi().list() as { signals: Signal[] };
        setSignals(res.signals ?? []);
      } catch {
        setError('Could not load signals.');
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  return (
    <motion.div
      initial={{ opacity: 0, x: 10 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -10 }}
      className="flex-1 w-full max-w-[720px] mx-auto px-6 py-12 flex flex-col gap-12 pb-32"
    >
      <div className="mb-4">
        <h1 className="font-serif text-5xl md:text-6xl text-neutral-900 mb-6 tracking-tight">Signals</h1>
        <p className="font-sans text-lg text-neutral-500 max-w-lg leading-relaxed">
          Tactical intelligence and telemetry anomalies. Real-time narrative synthesis.
        </p>
      </div>

      <div className="flex items-center gap-6 border-b border-neutral-200 pb-4">
        <span className="font-mono text-[10px] font-bold text-neutral-900 tracking-[0.2em]">FILTER:</span>
        <button className="text-neutral-900 font-sans text-sm font-bold border-b-2 border-neutral-900 transition-colors">All Signals</button>
        <button className="text-neutral-400 font-sans text-sm hover:text-f1-red transition-colors">Tire Degradation</button>
        <button className="text-neutral-400 font-sans text-sm hover:text-f1-red transition-colors">Aero Load</button>
      </div>

      {loading && (
        <div className="flex items-center justify-center py-24">
          <Loader2 size={24} className="animate-spin text-neutral-300" />
        </div>
      )}

      {error && (
        <p className="font-mono text-xs text-red-500">{error}</p>
      )}

      <div className="flex flex-col gap-10">
        {!loading && signals.length === 0 && !error && (
          <p className="font-mono text-sm text-neutral-400 text-center py-16">
            No signals detected yet.
          </p>
        )}

        {signals.map((signal) => (
          <article
            key={signal.id}
            className="bg-white border border-neutral-200 relative transition-all duration-300"
          >
            <div className={`absolute left-0 top-0 bottom-0 w-1 ${
              signal.priority === 'high' ? 'bg-f1-red' : 
              signal.priority === 'med' ? 'bg-caution-yellow' : 'bg-telemetry-blue'
            }`}></div>
            
            <div className="p-6 pl-8">
              <div className="flex justify-between items-center mb-8">
                <div className="flex items-center gap-2">
                  {signal.priority === 'high' ? (
                    <Circle className="text-f1-red fill-f1-red" size={14} />
                  ) : signal.priority === 'med' ? (
                    <AlertTriangle className="text-caution-yellow fill-caution-yellow" size={14} />
                  ) : (
                    <ZapIcon className="text-telemetry-blue fill-telemetry-blue" size={14} />
                  )}
                  <span className="font-mono text-[10px] font-bold text-neutral-400 tracking-widest">
                    LAP {signal.lap} / {signal.location}
                  </span>
                </div>
                <span className="font-mono text-[10px] font-bold text-neutral-900 bg-neutral-100 px-3 py-1.5 tracking-tighter">
                  PRIORITY: {signal.priority.toUpperCase()}
                </span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mb-8">
                <div>
                  <h3 className="font-mono text-[10px] font-bold text-neutral-400 mb-3 tracking-widest uppercase">Signal</h3>
                  <p className="font-sans text-base text-neutral-900 leading-relaxed">{signal.title}</p>
                </div>
                <div>
                  <h3 className="font-mono text-[10px] font-bold text-neutral-400 mb-3 tracking-widest uppercase">Meaning</h3>
                  <p className="font-sans text-base text-neutral-900 leading-relaxed">{signal.meaning}</p>
                </div>
                <div>
                  <h3 className="font-mono text-[10px] font-bold text-neutral-400 mb-3 tracking-widest uppercase">Implication</h3>
                  <p className="font-sans text-base text-neutral-900 leading-relaxed">{signal.implication}</p>
                </div>
              </div>

              {signal.telemetryFields && (
                <div className="border-t border-neutral-100 pt-6 mt-2">
                  <div className="flex flex-col md:flex-row gap-6">
                    {signal.telemetryFields.map((field, fIdx) => (
                      <div key={fIdx} className="flex-1">
                        <div className="flex justify-between font-mono text-[10px] font-bold text-neutral-400 mb-2 tracking-widest uppercase">
                          <span>{field.label}</span>
                          <span className={field.color}>{field.value}</span>
                        </div>
                        {field.percentage !== undefined && (
                          <div className="h-1 bg-neutral-100 w-full overflow-hidden">
                            <div 
                              className={`h-full ${field.color.replace('text-', 'bg-')} transition-all duration-1000`} 
                              style={{ width: `${field.percentage}%` }}
                            ></div>
                          </div>
                        )}
                        {!field.percentage && (
                          <div className="border border-neutral-100 bg-neutral-50 p-3 flex flex-col justify-center h-full">
                            <span className={`font-mono text-lg font-bold ${field.color}`}>{field.value}</span>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </article>
        ))}

        {signals.length > 0 && (
          <div className="mt-8 text-center">
            <button className="bg-neutral-900 text-white font-mono text-xs font-bold px-10 py-5 hover:bg-f1-red transition-all duration-300 tracking-[0.2em]">
              LOAD PREVIOUS SIGNALS
            </button>
          </div>
        )}
      </div>
    </motion.div>
  );
}
