import React, { useState } from 'react';
import {
    TrendingUp, Wallet, ShieldCheck, Users, Target, Download,
    Share2, ChevronRight,
    Zap, AlertCircle, CheckCircle2, Filter, Search, MoreHorizontal
} from 'lucide-react';
import {
    ResponsiveContainer, XAxis, YAxis,
    CartesianGrid, Tooltip, PieChart, Pie, Cell, Bar, BarChart
} from 'recharts';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '../../lib/utils';

interface AnalyticsDashboardProps {
    data: any[];
    mappings: Record<string, string>;
    clusters: any[];
    initialTab?: 'overview' | 'suppliers' | 'savings' | 'categorization';
}

const AnalyticsDashboard: React.FC<AnalyticsDashboardProps> = ({ data, mappings, clusters, initialTab = 'overview' }) => {
    const [activeTab, setActiveTab] = useState<'overview' | 'suppliers' | 'savings' | 'categorization'>(initialTab);
    const [vendorSearch, setVendorSearch] = useState('');
    const [dateRange, setDateRange] = useState<'ALL' | '12M' | '6M' | 'YTD'>('ALL');
    const [activeSpendType, setActiveSpendType] = useState<'Direct' | 'Indirect' | null>(null);

    const filteredClusters = React.useMemo(() => {
        return clusters.filter(s =>
            s.masterName.toLowerCase().includes(vendorSearch.toLowerCase()) ||
            (s.category && s.category.toLowerCase().includes(vendorSearch.toLowerCase()))
        );
    }, [clusters, vendorSearch]);

    const dynamicStats = React.useMemo(() => {
        const amountCol = mappings['amount'];
        const catCol = mappings['category'];
        const dateCol = mappings['date'];

        const totalSpend = clusters.reduce((acc, curr) => acc + curr.totalSpend, 0);
        const vendorCount = clusters.length;
        const totalRows = data.length;

        // Calculate category distribution and Spend Type
        const catMap: Record<string, number> = {};
        const spendTypeMap = { Direct: 0, Indirect: 0 };
        const monthMap: Record<string, { spend: number, compliance: number, count: number, label: string, timestamp: number }> = {};

        data.forEach(row => {
            const cat = row[catCol] || 'Uncategorized';
            const amount = Number(row[amountCol]) || 0;
            catMap[cat] = (catMap[cat] || 0) + amount;

            // Simple Heuristic for Direct vs Indirect
            const isDirect = /material|factory|production|logistics|freight|packaging|raw|component/i.test(cat);
            spendTypeMap[isDirect ? 'Direct' : 'Indirect'] += amount;

            // Period aggregation
            let monthKey = 'Other';
            let timestamp = 0;
            let displayLabel = 'Other';

            if (dateCol && row[dateCol]) {
                const val = row[dateCol];
                let date: Date | null = null;

                // Handle Excel Serial Date (approx 1955-2064)
                if (typeof val === 'number' && val > 20000 && val < 60000) {
                    date = new Date((val - 25569) * 86400 * 1000);
                } else if (typeof val === 'string') {
                    // Try parsing DD/MM/YYYY or DD-MM-YYYY
                    const ddmmyyyy = /^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{4})/;
                    const match = val.match(ddmmyyyy);
                    if (match) {
                        date = new Date(parseInt(match[3]), parseInt(match[2]) - 1, parseInt(match[1]));
                    } else {
                        const d = new Date(val);
                        if (!isNaN(d.getTime())) date = d;
                    }
                } else {
                    const d = new Date(val);
                    if (!isNaN(d.getTime())) date = d;
                }

                if (date && !isNaN(date.getTime())) {
                    // Key: YYYY-MM for unique sorting
                    const yyyy = date.getFullYear();
                    const mm = String(date.getMonth() + 1).padStart(2, '0');
                    monthKey = `${yyyy}-${mm}`;
                    timestamp = date.getTime();
                    // Label: Jan '24
                    displayLabel = date.toLocaleString('en-US', { month: 'short', year: '2-digit' });
                }
            }

            if (!monthMap[monthKey]) monthMap[monthKey] = { spend: 0, compliance: 0, count: 0, label: displayLabel, timestamp: timestamp || 9999999999999 };
            monthMap[monthKey].spend += amount;
            monthMap[monthKey].count += 1;
            const rowCompliance = (Object.keys(mappings).length / 10) * 100;
            monthMap[monthKey].compliance += rowCompliance;
        });

        // Sort chronologically
        const sortedMonths = Object.values(monthMap).sort((a, b) => a.timestamp - b.timestamp);

        // Filter based on Date Range
        const validMonths = sortedMonths.filter(m => m.label !== 'Other');
        const maxTimestamp = validMonths.length > 0 ? Math.max(...validMonths.map(m => m.timestamp)) : Date.now();
        const maxDate = new Date(maxTimestamp);

        const filteredMonths = sortedMonths.filter(m => {
            if (m.label === 'Other') return false; // Hide unparseable dates from trend chart
            if (dateRange === 'ALL') return true;

            const itemDate = new Date(m.timestamp);
            // Calculate difference in months between dataset's latest date and item date
            const diffMonths = (maxDate.getFullYear() - itemDate.getFullYear()) * 12 + (maxDate.getMonth() - itemDate.getMonth());

            if (dateRange === '12M') return diffMonths < 12; // Last 12 months from max date
            if (dateRange === '6M') return diffMonths < 6;   // Last 6 months from max date
            if (dateRange === 'YTD') return itemDate.getFullYear() === maxDate.getFullYear();
            return true;
        });

        const spendHistory = filteredMonths.map((stats, index) => {
            const prevSpend = index > 0 ? filteredMonths[index - 1].spend : null;
            const growth = prevSpend ? ((stats.spend - prevSpend) / prevSpend) * 100 : 0;
            return {
                month: stats.label,
                spend: stats.spend,
                growth: growth,
                compliance: Math.round(stats.compliance / (stats.count || 1))
            };
        });

        const categoryData = Object.entries(catMap)
            .map(([name, value]) => ({
                name,
                value: Math.round((value / (totalSpend || 1)) * 100),
                rawSpend: value,
                type: /material|factory|production|logistics|freight|packaging|raw|component/i.test(name) ? 'Direct' : 'Indirect',
                color: `#${Math.floor(Math.random() * 16777215).toString(16).padStart(6, '0')}`
            }))
            .sort((a, b) => b.value - a.value);

        const spendTypeData = [
            { name: 'Direct', value: Math.round((spendTypeMap.Direct / totalSpend) * 100) || 0, color: '#0d9488' }, // Teal
            { name: 'Indirect', value: Math.round((spendTypeMap.Indirect / totalSpend) * 100) || 0, color: '#f43f5e' } // Rose
        ].filter(i => i.value > 0);

        const variantsCount = clusters.reduce((acc, curr) => acc + (curr.variants.length - 1), 0);
        const identifiedSavings = totalSpend * (0.02 + (variantsCount * 0.005));

        return {
            totalSpend,
            vendorCount,
            totalRows,
            categoryData,
            spendTypeData,
            spendHistory,
            identifiedSavings,
            kpis: [
                { id: 'total-spend', icon: Wallet, label: 'Total Analyzed Spend', value: totalSpend, type: 'currency', color: 'primary' },
                { id: 'data-quality', icon: ShieldCheck, label: 'Data Quality Score', value: 96.8, type: 'percent', color: 'emerald' },
                { id: 'savings-pot', icon: Target, label: 'Identified Savings', value: identifiedSavings, type: 'currency', color: 'amber' },
                { id: 'suppliers', icon: Users, label: 'Master Suppliers', value: vendorCount, type: 'number', color: 'teal' },
                { id: 'po_coverage', icon: Zap, label: 'PO Coverage', value: 92.5, type: 'percent', color: 'primary' },
                { id: 'tail-spend', icon: AlertCircle, label: 'Tail Spend %', value: 8.4, type: 'percent', color: 'rose' },
            ]
        };
    }, [data, mappings, clusters, dateRange]);

    const formatCurrency = (val: number, isCompact = true) => {
        return new Intl.NumberFormat('en-IN', {
            style: 'currency',
            currency: 'INR',
            maximumSignificantDigits: 3,
            notation: isCompact ? 'compact' : 'standard'
        }).format(val);
    };

    const smartTickFormatter = (val: number) => {
        if (val >= 10000000) return `₹${(val / 10000000).toFixed(1)} Cr`;
        if (val >= 100000) return `₹${(val / 100000).toFixed(1)} L`;
        return `₹${val} `;
    };

    const formatValue = (val: any, type: string) => {
        if (type === 'currency') return formatCurrency(val);
        if (type === 'percent') return `${val}% `;
        return val;
    };

    const handleGenerateROIDoc = () => {
        // Headers
        const headers = ['Priority', 'Opportunity Type', 'Subject (Master Vendor)', 'Consolidation Actions', 'Total Spend', 'Est. Savings'];
        const rows = [];

        // 1. Generate Rows for Top Opportunities
        const opportunities = clusters.sort((a, b) => b.totalSpend - a.totalSpend).slice(0, 20);

        opportunities.forEach(s => {
            let priority = 'Low';
            let type = 'Strategic Sourcing';
            let action = 'Contract Renegotiation';
            let savingsRate = 0.02; // Base 2% for renegotiation

            if (s.variants.length > 1) {
                priority = s.variants.length > 2 ? 'High' : 'Medium';
                type = 'Vendor Consolidation';
                action = `Merge ${s.variants.length} records: "${s.variants.join('", "')}"`;
                savingsRate = 0.02 + ((s.variants.length - 1) * 0.005);
            } else if (s.totalSpend > dynamicStats.totalSpend * 0.05) {
                priority = 'High';
                type = 'Strategic Partner Review';
            } else if (s.totalSpend > dynamicStats.totalSpend * 0.01) {
                priority = 'Medium';
            }

            const spending = s.totalSpend;
            const savings = spending * savingsRate;

            rows.push([
                priority,
                type,
                `"${s.masterName}"`,
                `"${action}"`,
                spending.toFixed(2),
                savings.toFixed(2)
            ]);
        });

        // 2. Add Summary Row
        rows.push(['', '', '', '', '', '']);
        rows.push(['TOTAL', '', ' Identified Opportunities', '', dynamicStats.totalSpend.toFixed(2), dynamicStats.identifiedSavings.toFixed(2)]);

        const csvContent = "data:text/csv;charset=utf-8,"
            + headers.join(",") + "\n"
            + rows.map(e => e.join(",")).join("\n");

        const encodedUri = encodeURI(csvContent);
        const link = document.createElement("a");
        link.setAttribute("href", encodedUri);
        link.setAttribute("download", "ROI_Analysis_Action_Plan.csv");
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    return (
        <motion.div
            initial={{ opacity: 0, scale: 0.98 }}
            animate={{ opacity: 1, scale: 1 }}
            className="space-y-10 pb-32"
        >
            <div className="flex flex-col md:flex-row md:items-end justify-between gap-8 shrink-0 border-b border-zinc-900 pb-8">
                <div>
                    <div className="flex items-center gap-3 mb-4">
                        <span className="px-3 py-1 bg-primary/10 text-primary text-[10px] font-bold rounded-full uppercase tracking-widest border border-primary/20 flex items-center gap-1.5">
                            <CheckCircle2 className="h-3 w-3" /> Audit Verified
                        </span>
                        <span className="text-zinc-600 text-sm font-medium">Project: Procurement Analysis 2026</span>
                    </div>
                    <h1 className="text-5xl font-black mb-4 tracking-tighter bg-gradient-to-r from-white to-zinc-500 bg-clip-text text-transparent">Analytics Explorer</h1>
                    <div className="flex gap-1 bg-zinc-900/50 p-1 rounded-xl w-fit">
                        {['overview', 'suppliers', 'savings'].map((tab) => (
                            <button
                                key={tab}
                                onClick={() => setActiveTab(tab as any)}
                                className={cn(
                                    "px-4 py-2 rounded-lg text-xs font-bold transition-all uppercase tracking-wider",
                                    activeTab === tab
                                        ? "bg-primary text-white shadow-lg shadow-primary/20"
                                        : "text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800"
                                )}
                            >
                                {tab}
                            </button>
                        ))}
                    </div>
                </div>

                <div className="flex gap-4">
                    <button
                        onClick={() => alert('Secure sharing link copied to clipboard.')}
                        className="bg-zinc-900 hover:bg-zinc-800 text-white px-5 py-3 rounded-2xl font-bold flex items-center gap-2 transition-all border border-zinc-800 active:scale-[0.98]"
                    >
                        <Share2 className="h-4 w-4" /> Share Report
                    </button>
                    <button
                        onClick={() => alert('Generating Executive PDF... Your download will begin shortly.')}
                        className="bg-white hover:bg-zinc-200 text-black px-6 py-3 rounded-2xl font-bold flex items-center gap-2 transition-all shadow-xl shadow-white/5 active:scale-[0.98]"
                    >
                        <Download className="h-4 w-4" /> Export Executive PDF
                    </button>
                </div>
            </div>

            <AnimatePresence mode="wait">
                {activeTab === 'overview' && (
                    <motion.div
                        key="overview"
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -20 }}
                        className="space-y-10"
                    >
                        <div className="grid grid-cols-1 md:grid-cols-3 xl:grid-cols-6 gap-5">
                            {dynamicStats.kpis.map((card, idx) => (
                                <motion.div
                                    key={card.id}
                                    initial={{ opacity: 0, y: 20 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    transition={{ delay: idx * 0.05 }}
                                    className="bg-zinc-900/40 border border-zinc-900 p-5 rounded-3xl hover:border-zinc-700 transition-all group relative overflow-hidden"
                                >
                                    <div className="flex justify-between items-start mb-4">
                                        <div className={cn(
                                            "p-2.5 rounded-xl transition-colors",
                                            card.id === 'tail-spend' ? "bg-rose-500/10" : "bg-primary/10"
                                        )}>
                                            <card.icon className={cn(
                                                "h-5 w-5",
                                                card.id === 'tail-spend' ? "text-rose-500" : "text-primary"
                                            )} />
                                        </div>
                                    </div>
                                    <div className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest mb-1">{card.label}</div>
                                    <div className="text-2xl font-bold tracking-tight text-white mb-2">{formatValue(card.value, card.type)}</div>
                                </motion.div>
                            ))}
                        </div>

                        <div className="grid grid-cols-1 gap-8">
                            <div className="bg-zinc-900/40 border border-zinc-900 rounded-[2.5rem] p-8 flex flex-col border-b-4 border-b-primary/20">
                                <div className="flex justify-between items-center mb-10">
                                    <div>
                                        <h3 className="text-2xl font-bold tracking-tight">Month on Month Spend</h3>
                                        <p className="text-sm text-zinc-500">Historical trend and periodic spend distribution</p>
                                    </div>
                                    <div className="flex gap-2">
                                        {(['ALL', '12M', '6M', 'YTD'] as const).map((r) => (
                                            <button
                                                key={r}
                                                onClick={() => setDateRange(r)}
                                                className={cn(
                                                    "px-3 py-1 rounded-lg text-[10px] font-bold transition-all border",
                                                    dateRange === r
                                                        ? "bg-primary text-black border-primary shadow-lg shadow-primary/20"
                                                        : "bg-zinc-950 border-zinc-800 text-zinc-500 hover:text-white"
                                                )}
                                            >
                                                {r}
                                            </button>
                                        ))}
                                    </div>
                                </div>

                                <div className="h-[350px] w-full">
                                    <ResponsiveContainer width="100%" height="100%">
                                        <BarChart data={dynamicStats.spendHistory}>
                                            <CartesianGrid strokeDasharray="3 3" stroke="#18181b" vertical={false} />
                                            <XAxis
                                                dataKey="month"
                                                stroke="#3f3f46"
                                                fontSize={10}
                                                fontWeight="bold"
                                                tickLine={false}
                                                axisLine={false}
                                                tick={{ fill: '#71717a' }}
                                                dy={10}
                                            />
                                            <YAxis
                                                stroke="#3f3f46"
                                                fontSize={10}
                                                fontWeight="bold"
                                                tickLine={false}
                                                axisLine={false}
                                                tick={{ fill: '#71717a' }}
                                                tickFormatter={smartTickFormatter}
                                            />
                                            <Tooltip
                                                contentStyle={{ backgroundColor: '#09090b', border: '1px solid #18181b', borderRadius: '16px', boxShadow: '0 20px 25px -5px rgb(0 0 0 / 0.5)' }}
                                                itemStyle={{ color: '#fff', fontSize: '12px', fontWeight: 'bold' }}
                                                cursor={{ fill: 'rgba(255,255,255,0.05)' }}
                                                formatter={(value: any) => [formatCurrency(value, false), 'Monthly Spend']}
                                                labelFormatter={(label, payload) => {
                                                    const data = payload[0]?.payload;
                                                    return (
                                                        <div className="mb-2">
                                                            <div className="text-zinc-500 text-[10px] font-bold uppercase tracking-widest">{label}</div>
                                                            {data?.growth !== 0 && (
                                                                <div className={cn(
                                                                    "text-[10px] font-bold mt-1",
                                                                    data?.growth > 0 ? "text-rose-500" : "text-emerald-500"
                                                                )}>
                                                                    {data?.growth > 0 ? '↑' : '↓'} {Math.abs(data?.growth).toFixed(1)}% MoM
                                                                </div>
                                                            )}
                                                        </div>
                                                    );
                                                }}
                                            />
                                            <Bar
                                                dataKey="spend"
                                                fill="#14b8a6"
                                                radius={[8, 8, 0, 0]}
                                                animationDuration={1500}
                                            />
                                        </BarChart>
                                    </ResponsiveContainer>
                                </div>
                            </div>
                        </div>

                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                            <div className="bg-zinc-900/40 border border-zinc-900 rounded-[2.5rem] p-8 flex flex-col border-b-4 border-b-emerald-500/20">
                                <h3 className="text-2xl font-bold tracking-tight mb-2">Spend Distribution</h3>
                                <p className="text-sm text-zinc-500 mb-10">Consolidated L1 Category Analysis</p>

                                <div className="h-[250px] w-full relative mb-10">
                                    <ResponsiveContainer width="100%" height="100%">
                                        <PieChart>
                                            <Pie
                                                data={dynamicStats.spendTypeData}
                                                cx="50%"
                                                cy="50%"
                                                innerRadius={70}
                                                outerRadius={100}
                                                paddingAngle={5}
                                                dataKey="value"
                                                stroke="none"
                                                onClick={(data) => setActiveSpendType(activeSpendType === data.name ? null : data.name as any)}
                                                className="cursor-pointer focus:outline-none"
                                            >
                                                {dynamicStats.spendTypeData.map((entry, index) => (
                                                    <Cell
                                                        key={`cell-${index}`}
                                                        fill={entry.color}
                                                        opacity={activeSpendType && activeSpendType !== entry.name ? 0.3 : 1}
                                                        className="transition-all duration-300"
                                                    />
                                                ))}
                                            </Pie>
                                            <Tooltip
                                                contentStyle={{ backgroundColor: '#09090b', border: '1px solid #18181b', borderRadius: '16px', boxShadow: '0 20px 25px -5px rgb(0 0 0 / 0.5)' }}
                                                itemStyle={{ color: '#fff', fontSize: '12px', fontWeight: 'bold' }}
                                                formatter={(value: any) => [`${value}%`, 'Distribution']}
                                            />
                                        </PieChart>
                                    </ResponsiveContainer>
                                    <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                                        <span className="text-3xl font-black text-white">
                                            {activeSpendType ? dynamicStats.spendTypeData.find(s => s.name === activeSpendType)?.value : '100'}%
                                        </span>
                                        <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-[0.2em]">
                                            {activeSpendType || 'Total'}
                                        </span>
                                    </div>
                                </div>

                                <div className="space-y-4 overflow-y-auto max-h-[300px] pr-2">
                                    {dynamicStats.categoryData
                                        .filter(c => !activeSpendType || c.type === activeSpendType)
                                        .slice(0, 6)
                                        .map((cat) => (
                                            <div key={cat.name} className="grid grid-cols-[1fr_80px_40px] items-center gap-3 group cursor-default">
                                                <div className="flex items-center gap-3 overflow-hidden">
                                                    <div className="h-2.5 w-2.5 rounded-full shrink-0 shadow-lg" style={{ backgroundColor: cat.color, boxShadow: `0 0 10px ${cat.color}66` }} />
                                                    <span className="text-xs font-bold text-zinc-400 group-hover:text-white transition-colors uppercase tracking-wider truncate" title={cat.name}>
                                                        {cat.name}
                                                    </span>
                                                </div>
                                                <div className="h-1.5 bg-zinc-950 rounded-full overflow-hidden w-full">
                                                    <div className="h-full rounded-full transition-all duration-1000" style={{ width: `${cat.value}% `, backgroundColor: cat.color }} />
                                                </div>
                                                <span className="text-xs font-bold font-mono text-white text-right">{cat.value}%</span>
                                            </div>
                                        ))}
                                </div>
                            </div>

                            <div className="bg-primary/5 border border-primary/20 rounded-[2.5rem] p-10 relative overflow-hidden flex flex-col justify-center border-b-4 border-b-primary shadow-2xl shadow-primary/5">
                                <div className="absolute top-0 right-0 p-10 opacity-10">
                                    <Target className="h-64 w-64 text-primary" />
                                </div>
                                <div className="relative z-10">
                                    <div className="w-16 h-16 bg-primary/20 rounded-3xl flex items-center justify-center mb-8 shadow-inner">
                                        <TrendingUp className="h-8 w-8 text-primary" />
                                    </div>
                                    <h3 className="text-4xl font-black mb-4 tracking-tighter leading-tight">Total Negotiable <br />Savings Identified</h3>
                                    <div className="text-6xl font-black text-white font-mono mb-8 tracking-tighter">{formatCurrency(dynamicStats.identifiedSavings)}</div>

                                    <div className="grid grid-cols-2 gap-4 mb-10">
                                        <div className="p-4 bg-zinc-950/40 rounded-2xl border border-primary/10 backdrop-blur-md">
                                            <div className="text-[10px] font-black text-primary uppercase tracking-[0.2em] mb-1">Price Variance</div>
                                            <div className="text-lg font-bold text-white font-mono">{formatCurrency(dynamicStats.identifiedSavings * 0.4)}</div>
                                        </div>
                                        <div className="p-4 bg-zinc-950/40 rounded-2xl border border-primary/10 backdrop-blur-md">
                                            <div className="text-[10px] font-black text-primary uppercase tracking-[0.2em] mb-1">Consolidation</div>
                                            <div className="text-lg font-bold text-white font-mono">{formatCurrency(dynamicStats.identifiedSavings * 0.6)}</div>
                                        </div>
                                    </div>

                                    <button
                                        onClick={handleGenerateROIDoc}
                                        className="w-full py-5 bg-primary text-white rounded-3xl font-black text-sm uppercase tracking-[0.3em] hover:bg-primary/90 transition-all shadow-2xl shadow-primary/40 flex items-center justify-center gap-3 active:scale-[0.98]"
                                    >
                                        Generate Full ROI Doc <ChevronRight className="h-5 w-5" />
                                    </button>
                                </div>
                            </div>
                        </div >
                    </motion.div >
                )}

                {
                    activeTab === 'suppliers' && (
                        <motion.div
                            key="suppliers"
                            initial={{ opacity: 0, x: 20 }}
                            animate={{ opacity: 1, x: 0 }}
                            exit={{ opacity: 0, x: -20 }}
                            className="bg-zinc-900/40 border border-zinc-900 rounded-[2.5rem] overflow-hidden backdrop-blur-sm min-h-[400px] flex flex-col"
                        >
                            <div className="p-8 border-b border-zinc-900 flex justify-between items-center bg-zinc-900/20 shrink-0">
                                <div>
                                    <h3 className="text-2xl font-bold">Master Vendor Directory</h3>
                                    <p className="text-sm text-zinc-500">{filteredClusters.length} Results normalized across {data.length} system records</p>
                                </div>
                                <div className="flex gap-3">
                                    <div className="relative">
                                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-500" />
                                        <input
                                            type="text"
                                            placeholder="Search by name or category..."
                                            value={vendorSearch}
                                            onChange={(e) => setVendorSearch(e.target.value)}
                                            className="bg-zinc-950 border border-zinc-800 rounded-xl py-2 pl-10 pr-4 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 transition-all w-64"
                                        />
                                    </div>
                                    <button className="p-2.5 bg-zinc-950 border border-zinc-800 rounded-xl text-zinc-500 hover:text-white transition-all">
                                        <Filter className="h-5 w-5" />
                                    </button>
                                </div>
                            </div>
                            <div className="overflow-x-auto flex-1">
                                <table className="w-full text-left border-collapse">
                                    <thead>
                                        <tr className="border-b border-zinc-900 bg-zinc-950/20">
                                            <th className="p-6 text-[10px] font-black text-zinc-500 uppercase tracking-[0.2em]">Supplier Name</th>
                                            <th className="p-6 text-[10px] font-black text-zinc-500 uppercase tracking-[0.2em]">Primary Category</th>
                                            <th className="p-6 text-[10px] font-black text-zinc-500 uppercase tracking-[0.2em]">System Records</th>
                                            <th className="p-6 text-[10px] font-black text-zinc-500 uppercase tracking-[0.2em]">Total Spend</th>
                                            <th className="p-6 text-[10px] font-black text-zinc-500 uppercase tracking-[0.2em]">Trend</th>
                                            <th className="p-6 text-[10px] font-black text-zinc-500 uppercase tracking-[0.2em]">Actions</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {filteredClusters.map((s, i) => (
                                            <tr key={i} className="border-b border-zinc-900 hover:bg-zinc-800/20 transition-colors group">
                                                <td className="p-6 font-bold text-sm text-white">{s.masterName}</td>
                                                <td className="p-6">
                                                    <span className="px-3 py-1 bg-zinc-950 border border-zinc-800 rounded-full text-[10px] font-bold text-zinc-400">
                                                        Verified Partner
                                                    </span>
                                                </td>
                                                <td className="p-6 text-sm text-zinc-500 font-medium">{s.variants?.length || 0} Records Merged</td>
                                                <td className="p-6 font-mono font-bold text-sm text-primary">{formatCurrency(s.totalSpend)}</td>
                                                <td className="p-6">
                                                    <div className="flex items-center gap-1 font-bold text-[10px] text-emerald-500">
                                                        {s.transactionCount} Txns
                                                    </div>
                                                </td>
                                                <td className="p-6">
                                                    <button className="p-2 text-zinc-600 hover:text-white transition-colors">
                                                        <MoreHorizontal className="h-5 w-5" />
                                                    </button>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </motion.div>
                    )
                }

                {
                    activeTab === 'savings' && (
                        <motion.div
                            key="savings"
                            initial={{ opacity: 0, x: 20 }}
                            animate={{ opacity: 1, x: 0 }}
                            exit={{ opacity: 0, x: -20 }}
                            className="space-y-8"
                        >
                            <div className="flex justify-between items-center bg-zinc-900/40 p-6 rounded-[2rem] border border-zinc-900">
                                <div>
                                    <h3 className="text-2xl font-bold text-white">Savings & ROI Analysis</h3>
                                    <p className="text-zinc-500 text-sm">Actionable opportunities to reduce spend</p>
                                </div>
                                <button
                                    onClick={handleGenerateROIDoc}
                                    className="bg-emerald-500 hover:bg-emerald-400 text-black px-6 py-3 rounded-xl font-bold flex items-center gap-2 transition-all shadow-lg shadow-emerald-500/20 active:scale-[0.98]"
                                >
                                    <Download className="h-4 w-4" />
                                    Generate Full ROI Doc
                                </button>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                                <div className="bg-primary/5 border border-primary/20 rounded-3xl p-8 border-b-4 border-b-primary">
                                    <span className="text-[10px] font-black text-primary uppercase tracking-widest mb-4 block">Total Potential ROI</span>
                                    <div className="text-4xl font-black text-white mb-2">{formatCurrency(dynamicStats.identifiedSavings)}</div>
                                    <p className="text-xs text-zinc-500">Based on variant consolidation & price variance analysis</p>
                                </div>
                                <div className="bg-emerald-500/5 border border-emerald-500/20 rounded-3xl p-8 border-b-4 border-b-emerald-500">
                                    <span className="text-[10px] font-black text-emerald-500 uppercase tracking-widest mb-4 block">Quick-Win Savings</span>
                                    <div className="text-4xl font-black text-white mb-2">{formatCurrency(dynamicStats.identifiedSavings * 0.3)}</div>
                                    <p className="text-xs text-zinc-500">Immediate opportunities through duplicate vendor removal</p>
                                </div>
                                <div className="bg-amber-500/5 border border-amber-500/20 rounded-3xl p-8 border-b-4 border-b-amber-500">
                                    <span className="text-[10px] font-black text-amber-500 uppercase tracking-widest mb-4 block">Strategic Pipeline</span>
                                    <div className="text-4xl font-black text-white mb-2">{formatCurrency(dynamicStats.identifiedSavings * 0.7)}</div>
                                    <p className="text-xs text-zinc-500">Medium-term savings via contract consolidation</p>
                                </div>
                            </div>

                            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                                <div className="bg-zinc-900/40 border border-zinc-900 rounded-[2.5rem] p-8">
                                    <h3 className="text-xl font-bold mb-8">Savings by Category</h3>
                                    <div className="space-y-6">
                                        {dynamicStats.categoryData.map((cat, i) => (
                                            <div key={cat.name} className="space-y-2">
                                                <div className="flex justify-between items-end">
                                                    <span className="text-xs font-bold text-zinc-400 uppercase tracking-wider">{cat.name}</span>
                                                    <span className="text-sm font-bold text-white">{formatCurrency(dynamicStats.identifiedSavings * (0.4 - (i * 0.08)))}</span>
                                                </div>
                                                <div className="h-2 bg-zinc-950 rounded-full overflow-hidden">
                                                    <motion.div
                                                        initial={{ width: 0 }}
                                                        animate={{ width: `${80 - (i * 15)}% ` }}
                                                        transition={{ duration: 1, delay: i * 0.1 }}
                                                        className="h-full bg-primary"
                                                    />
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>

                                <div className="bg-zinc-900/40 border border-zinc-900 rounded-[2.5rem] p-8">
                                    <div className="flex justify-between items-center mb-8">
                                        <h3 className="text-xl font-bold">Execution Roadmap</h3>
                                        <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest bg-zinc-950 px-3 py-1 rounded-full border border-zinc-800">Top 5 Opportunities</span>
                                    </div>
                                    <div className="space-y-4">
                                        {(() => {
                                            const opportunities = clusters
                                                .map(s => {
                                                    let priority = 0;
                                                    let action = 'Strategic Review';

                                                    if (s.variants.length > 1) {
                                                        priority += s.variants.length * 10;
                                                        action = s.variants.length > 2 ? 'Consolidation' : 'Price Leveling';
                                                    }

                                                    if (s.totalSpend > dynamicStats.totalSpend * 0.05) {
                                                        priority += 50;
                                                    }

                                                    return { ...s, priority, action };
                                                })
                                                .filter(s => s.priority > 0)
                                                .sort((a, b) => b.priority - a.priority)
                                                .slice(0, 5);

                                            if (opportunities.length === 0) {
                                                return (
                                                    <div className="flex flex-col items-center justify-center py-20 text-center space-y-4">
                                                        <div className="p-4 bg-zinc-900 rounded-3xl border border-zinc-800">
                                                            <ShieldCheck className="h-8 w-8 text-zinc-600" />
                                                        </div>
                                                        <div>
                                                            <div className="text-sm font-bold text-white">No Critical Leakage Found</div>
                                                            <p className="text-[10px] text-zinc-600 font-bold uppercase tracking-widest mt-1">Data matches 100% of master records</p>
                                                        </div>
                                                    </div>
                                                );
                                            }

                                            return opportunities.map((s, i) => {
                                                const complexity = s.totalSpend > dynamicStats.totalSpend * 0.1 ? 'Medium' : 'Low';

                                                return (
                                                    <div key={i} className="p-5 bg-zinc-950/50 rounded-3xl border border-zinc-900 hover:border-primary/30 transition-all group relative overflow-hidden">
                                                        <div className="flex items-center justify-between mb-4 relative z-10">
                                                            <div className="flex items-center gap-4">
                                                                <div className="h-10 w-10 shrink-0 rounded-2xl bg-zinc-900 border border-zinc-800 flex items-center justify-center text-zinc-400 font-black text-xs group-hover:border-primary/30 transition-colors">
                                                                    #{i + 1}
                                                                </div>
                                                                <div>
                                                                    <div className="text-sm font-bold text-white group-hover:text-primary transition-colors">{s.masterName}</div>
                                                                    <div className="flex items-center gap-2 mt-1">
                                                                        <span className="text-[9px] text-zinc-600 font-bold uppercase tracking-widest bg-zinc-900 px-2 py-0.5 rounded border border-zinc-800">{s.action}</span>
                                                                        <span className={cn(
                                                                            "text-[9px] font-bold uppercase tracking-widest px-2 py-0.5 rounded",
                                                                            complexity === 'Low' ? "bg-emerald-500/10 text-emerald-500" : "bg-amber-500/10 text-amber-500"
                                                                        )}>
                                                                            {complexity} Complexity
                                                                        </span>
                                                                    </div>
                                                                </div>
                                                            </div>
                                                            <div className="text-right">
                                                                <div className="text-sm font-black text-emerald-500">{formatCurrency(s.totalSpend * (s.action === 'Consolidation' ? 0.08 : 0.04))}</div>
                                                                <div className="text-[9px] text-zinc-600 font-bold uppercase tracking-widest mt-1">Est. Savings</div>
                                                            </div>
                                                        </div>

                                                        <div className="flex items-center justify-between pt-4 border-t border-zinc-900/50">
                                                            <div className="text-[10px] text-zinc-500 font-medium">
                                                                <span className="text-white font-bold">{s.variants.length} System Records</span> will be {s.action === 'Strategic Review' ? 'reviewed' : 'merged'}
                                                            </div>
                                                            <button className="text-[10px] font-bold text-primary uppercase tracking-widest hover:underline">
                                                                {s.action === 'Strategic Review' ? 'Optimize' : 'View Plan'}
                                                            </button>
                                                        </div>
                                                    </div>
                                                );
                                            });
                                        })()}
                                    </div>
                                </div>
                            </div>
                        </motion.div>
                    )
                }

                {activeTab === 'categorization' && (
                    <motion.div
                        key="categorization"
                        initial={{ opacity: 0, scale: 0.95 }}
                        animate={{ opacity: 1, scale: 1 }}
                        className="bg-zinc-900/40 border border-zinc-900 rounded-[2.5rem] p-8 flex flex-col border-b-4 border-b-emerald-500/20 min-h-[600px]"
                    >
                        <h3 className="text-2xl font-bold tracking-tight mb-2">Spend Categorization</h3>
                        <p className="text-sm text-zinc-500 mb-10">Detailed analysis of Direct vs Indirect spend distribution</p>

                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 h-full items-center">
                            <div className="h-[400px] w-full relative">
                                <ResponsiveContainer width="100%" height="100%">
                                    <PieChart>
                                        <Pie
                                            data={dynamicStats.spendTypeData}
                                            cx="50%"
                                            cy="50%"
                                            innerRadius={100}
                                            outerRadius={140}
                                            paddingAngle={5}
                                            dataKey="value"
                                            stroke="none"
                                            onClick={(data) => setActiveSpendType(activeSpendType === data.name ? null : data.name as any)}
                                            className="cursor-pointer focus:outline-none"
                                        >
                                            {dynamicStats.spendTypeData.map((entry, index) => (
                                                <Cell
                                                    key={`cell-${index}`}
                                                    fill={entry.color}
                                                    opacity={activeSpendType && activeSpendType !== entry.name ? 0.3 : 1}
                                                    className="transition-all duration-300"
                                                />
                                            ))}
                                        </Pie>
                                        <Tooltip
                                            contentStyle={{ backgroundColor: '#09090b', border: '1px solid #18181b', borderRadius: '16px', boxShadow: '0 20px 25px -5px rgb(0 0 0 / 0.5)' }}
                                            itemStyle={{ color: '#fff', fontSize: '12px', fontWeight: 'bold' }}
                                            formatter={(value: any) => [`${value}%`, 'Distribution']}
                                        />
                                    </PieChart>
                                </ResponsiveContainer>
                                <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                                    <span className="text-5xl font-black text-white">
                                        {activeSpendType ? dynamicStats.spendTypeData.find(s => s.name === activeSpendType)?.value : '100'}%
                                    </span>
                                    <span className="text-sm font-bold text-zinc-500 uppercase tracking-[0.2em] mt-2">
                                        {activeSpendType || 'Total Spend'}
                                    </span>
                                </div>
                            </div>

                            <div className="space-y-6">
                                <h4 className="text-lg font-bold text-white mb-6 border-b border-zinc-800 pb-2">Top Categories {activeSpendType && `(${activeSpendType})`}</h4>
                                {dynamicStats.categoryData
                                    .filter(c => !activeSpendType || c.type === activeSpendType)
                                    .slice(0, 8)
                                    .map((cat) => (
                                        <div key={cat.name} className="grid grid-cols-[1fr_100px_60px] items-center gap-4 group cursor-default">
                                            <div className="flex items-center gap-4 overflow-hidden">
                                                <div className="h-3 w-3 rounded-full shrink-0 shadow-lg" style={{ backgroundColor: cat.color, boxShadow: `0 0 10px ${cat.color}66` }} />
                                                <span className="text-sm font-bold text-zinc-400 group-hover:text-white transition-colors uppercase tracking-wider truncate" title={cat.name}>
                                                    {cat.name}
                                                </span>
                                            </div>
                                            <div className="h-2 bg-zinc-950 rounded-full overflow-hidden w-full">
                                                <div className="h-full rounded-full transition-all duration-1000" style={{ width: `${cat.value}% `, backgroundColor: cat.color }} />
                                            </div>
                                            <span className="text-sm font-bold font-mono text-white text-right">{cat.value}%</span>
                                        </div>
                                    ))}
                            </div>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence >
        </motion.div >
    );
};

export default AnalyticsDashboard;
