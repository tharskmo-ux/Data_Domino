import React, { useMemo } from 'react';
import { BarChart2, AlertCircle, CheckCircle2, Info, Database, Activity } from 'lucide-react';
import {
    ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Cell, LabelList
} from 'recharts';

interface DataProfilingProps {
    data: any[];
    headers: string[];
    normalizationSummary?: {
        currenciesDetected: string[];
        rowsConverted: number;
        assumptionsMade: boolean;
        totalRows: number;
    };
}

const DataProfiling: React.FC<DataProfilingProps> = ({ data, headers, normalizationSummary }) => {
    const profile = useMemo(() => {
        if (!data || data.length === 0) return null;

        const stats = headers.map(header => {
            let nullCount = 0;
            const uniqueValues = new Set();
            let maxLength = 0;

            data.forEach(row => {
                const val = row[header];
                if (val === null || val === undefined || String(val).trim() === '') {
                    nullCount++;
                } else {
                    uniqueValues.add(val);
                    const len = String(val).length;
                    if (len > maxLength) maxLength = len;
                }
            });

            const fillRate = Math.round(((data.length - nullCount) / data.length) * 100);
            return {
                header,
                nullCount,
                fillRate,
                uniqueness: Math.round((uniqueValues.size / data.length) * 100),
                uniqueCount: uniqueValues.size,
                maxLength
            };
        });

        const overallQuality = Math.round(stats.reduce((acc, s) => acc + s.fillRate, 0) / stats.length);

        return {
            stats,
            overallQuality,
            totalRows: data.length,
            totalCols: headers.length
        };
    }, [data, headers]);

    if (!profile) return null;


    return (
        <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="flex justify-between items-end">
                <div>
                    <h2 className="text-3xl font-bold tracking-tight mb-2">Data Profile</h2>
                    <p className="text-zinc-500">Structural analysis of the {profile.totalRows.toLocaleString()} ingested records.</p>
                </div>
                <div className="flex items-center gap-4">
                    <div className="px-4 py-2 bg-zinc-900 rounded-2xl border border-zinc-800 flex items-center gap-3">
                        <Activity className="h-5 w-5 text-primary" />
                        <div>
                            <div className="text-[10px] text-zinc-500 font-bold uppercase tracking-widest">Quality Score</div>
                            <div className="text-lg font-bold text-white">{profile.overallQuality}%</div>
                        </div>
                    </div>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Currency Normalization */}
                <div className="bg-zinc-900/50 border border-zinc-800 rounded-3xl p-6 flex flex-col justify-between">
                    <div>
                        <h3 className="text-sm font-bold text-zinc-400 uppercase tracking-widest flex items-center gap-2 mb-6">
                            <Activity className="h-4 w-4" /> Currency Normalization
                        </h3>

                        <div className="space-y-4">
                            <div className="grid grid-cols-2 gap-2">
                                <div className="p-3 bg-zinc-950 rounded-xl border border-zinc-800">
                                    <div className="text-[10px] text-zinc-500 font-bold uppercase">Detected</div>
                                    <div className="text-sm font-black text-white truncate">
                                        {normalizationSummary?.currenciesDetected.join(', ') || 'INR'}
                                    </div>
                                </div>
                                <div className="p-3 bg-zinc-950 rounded-xl border border-zinc-800">
                                    <div className="text-[10px] text-zinc-500 font-bold uppercase">Converted</div>
                                    <div className="text-sm font-black text-white">
                                        {normalizationSummary?.rowsConverted || 0} rows
                                    </div>
                                </div>
                            </div>

                            <div className="space-y-2">
                                <div className="text-[10px] text-zinc-500 font-bold uppercase tracking-wider">Conversion Rates</div>
                                <div className="grid grid-cols-3 gap-2">
                                    <div className="px-2 py-1 bg-zinc-950 rounded border border-zinc-900 text-[10px] flex justify-between">
                                        <span className="text-zinc-500">USD</span>
                                        <span className="text-primary font-bold">84</span>
                                    </div>
                                    <div className="px-2 py-1 bg-zinc-950 rounded border border-zinc-900 text-[10px] flex justify-between">
                                        <span className="text-zinc-500">EUR</span>
                                        <span className="text-primary font-bold">91</span>
                                    </div>
                                    <div className="px-2 py-1 bg-zinc-950 rounded border border-zinc-900 text-[10px] flex justify-between">
                                        <span className="text-zinc-500">GBP</span>
                                        <span className="text-primary font-bold">106</span>
                                    </div>
                                </div>
                            </div>

                            {normalizationSummary?.assumptionsMade && (
                                <div className="flex items-center gap-3 p-3 bg-amber-500/5 border border-amber-500/20 rounded-xl">
                                    <AlertCircle className="h-4 w-4 text-amber-500 shrink-0" />
                                    <p className="text-[10px] font-bold text-amber-500 leading-tight">
                                        Currency not detected for some rows — assumed INR. Please verify.
                                    </p>
                                </div>
                            )}
                        </div>
                    </div>
                </div>

                {/* Fill Rate Chart */}
                <div className="lg:col-span-2 bg-zinc-900/50 border border-zinc-800 rounded-3xl p-6">
                    <h3 className="text-sm font-bold text-zinc-400 mb-6 uppercase tracking-widest flex items-center gap-2">
                        <BarChart2 className="h-4 w-4" /> Column Fill Rates (%)
                    </h3>
                    <div className="h-64 w-full">
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={profile.stats} layout="vertical" margin={{ left: 40, right: 40 }}>
                                <CartesianGrid strokeDasharray="3 3" stroke="#18181b" horizontal={true} vertical={false} />
                                <XAxis type="number" hide domain={[0, 100]} />
                                <YAxis
                                    dataKey="header"
                                    type="category"
                                    stroke="#3f3f46"
                                    fontSize={10}
                                    fontWeight="bold"
                                    tickLine={false}
                                    axisLine={false}
                                />
                                <Tooltip
                                    contentStyle={{ backgroundColor: '#09090b', border: '1px solid #18181b', borderRadius: '12px' }}
                                    itemStyle={{ fontSize: '12px' }}
                                    formatter={(value: any) => [`${Number(value)}%`, 'Fill Rate']}
                                />
                                <Bar dataKey="fillRate" radius={[0, 4, 4, 0]} barSize={12}>
                                    {profile.stats.map((entry, index) => (
                                        <Cell key={`cell-${index}`} fill={entry.fillRate > 80 ? '#14b8a6' : entry.fillRate > 50 ? '#f59e0b' : '#f43f5e'} />
                                    ))}
                                    <LabelList dataKey="fillRate" position="right" fill="#fff" fontSize={10} fontWeight="bold" formatter={(val: any) => `${Number(val)}%`} />
                                </Bar>
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Uniqueness & Schema */}
                <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-6 space-y-6">
                    <h3 className="text-sm font-bold text-zinc-400 uppercase tracking-widest flex items-center gap-2">
                        <Database className="h-4 w-4" /> Schema Health
                    </h3>

                    <div className="space-y-4">
                        {profile.stats.slice(0, 5).map((s, idx) => (
                            <div key={idx} className="space-y-2">
                                <div className="flex justify-between text-xs">
                                    <span className="text-zinc-400 font-bold">{s.header}</span>
                                    <span className="text-zinc-600 font-mono">{s.uniqueCount} unique</span>
                                </div>
                                <div className="h-1 bg-zinc-950 rounded-full overflow-hidden">
                                    <div
                                        className="h-full bg-primary/50"
                                        style={{ width: `${s.uniqueness}%` }}
                                    />
                                </div>
                            </div>
                        ))}
                    </div>

                    <div className="pt-4 border-t border-zinc-800">
                        <div className="flex items-center gap-3 text-amber-500/80 bg-amber-500/5 p-4 rounded-2xl border border-amber-500/10">
                            <AlertCircle className="h-5 w-5 shrink-0" />
                            <p className="text-[10px] font-medium leading-relaxed">
                                Columns with low fill rates may hinder deep categorization and supplier parentage resolution.
                            </p>
                        </div>
                    </div>
                </div>

                {/* Recommendations */}
                <div className="space-y-4">
                    <h3 className="text-sm font-bold text-zinc-400 uppercase tracking-widest flex items-center gap-2">
                        <Info className="h-4 w-4" /> System Recommendations
                    </h3>
                    <div className="grid grid-cols-1 gap-4">
                        {profile.stats.filter(s => s.fillRate < 90).slice(0, 3).map((s, idx) => (
                            <div key={idx} className="flex items-center gap-4 p-4 bg-zinc-900/30 border border-zinc-900 rounded-2xl">
                                <div className="h-8 w-8 rounded-xl bg-rose-500/10 flex items-center justify-center">
                                    <Info className="h-4 w-4 text-rose-500" />
                                </div>
                                <div>
                                    <div className="text-xs font-bold text-white">Low density: "{s.header}"</div>
                                    <p className="text-[10px] text-zinc-500 mt-0.5">{s.nullCount} missing values.</p>
                                </div>
                            </div>
                        ))}
                        {profile.stats.filter(s => s.fillRate >= 99).length > 2 && (
                            <div className="flex items-center gap-4 p-4 bg-emerald-500/5 border border-emerald-500/10 rounded-2xl">
                                <div className="h-8 w-8 rounded-xl bg-emerald-500/10 flex items-center justify-center">
                                    <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                                </div>
                                <div>
                                    <div className="text-xs font-bold text-emerald-500">Perfect Signal: Primary Keys</div>
                                    <p className="text-[10px] text-zinc-500 mt-0.5">High integrity columns found.</p>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};

export default DataProfiling;
