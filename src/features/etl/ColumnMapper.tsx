import React, { useState } from 'react';
import { ArrowRight, Check, AlertCircle, HelpCircle, Save } from 'lucide-react';
import { motion } from 'framer-motion';
import { cn } from '../../lib/utils';

interface MappingField {
    id: string;
    name: string;
    required: boolean;
    description: string;
    mappedTo?: string;
}

const SYSTEM_FIELDS: MappingField[] = [
    { id: 'date', name: 'Invoice Date', required: true, description: 'The date the invoice was issued.' },
    { id: 'amount', name: 'Total Amount', required: true, description: 'Total value including taxes.' },
    { id: 'supplier', name: 'Supplier Name', required: true, description: 'Legal name of the vendor.' },
    { id: 'currency', name: 'Currency', required: false, description: 'ISO code or symbol (e.g., INR, $).' },
    { id: 'category', name: 'Category L1', required: false, description: 'High-level procurement category.' },
    { id: 'gl_account', name: 'GL Account', required: false, description: 'General Ledger account code.' },
    { id: 'plant', name: 'Plant Name', required: false, description: 'Manufacturing or storage facility name.' },
    { id: 'location', name: 'Location', required: false, description: 'Geographic location or branch.' },
    { id: 'buyer', name: 'User/Buyer', required: false, description: 'Person or department responsible.' },
    { id: 'po_number', name: 'PO Number', required: false, description: 'Purchase Order identifier.' },
];

interface ColumnMapperProps {
    onConfirm: (mappings: Record<string, string>, globalCurrency: string) => void;
    headers: string[];
    initialMappings?: Record<string, string>;
}

const ColumnMapper: React.FC<ColumnMapperProps> = ({ onConfirm, headers, initialMappings }) => {
    const [mappings, setMappings] = useState<Record<string, string>>(() => {
        if (initialMappings && Object.keys(initialMappings).length > 0) {
            return initialMappings;
        }

        // Intelligent Auto-mapping logic
        const initial: Record<string, string> = {};

        headers.forEach(header => {
            const h = header.toLowerCase().replace(/[^a-z0-9]/g, '');

            if (h.includes('date')) initial['date'] = header;
            if (h.includes('amount') || h.includes('val') || h.includes('sum')) initial['amount'] = header;
            if (h.includes('vendor') || h.includes('supplier') || h.includes('name')) initial['supplier'] = header;
            if (h.includes('currency') || h.includes('curr')) initial['currency'] = header;
            if (h.includes('cat') || h.includes('dept')) initial['category'] = header;
            if (h.includes('po') || h.includes('order')) initial['po_number'] = header;
            if (h.includes('plant') || h.includes('facility')) initial['plant'] = header;
            if (h.includes('loc')) initial['location'] = header;
        });

        return initial;
    });
    const [globalCurrency, setGlobalCurrency] = useState('INR');

    const handleMap = (fieldId: string, header: string) => {
        setMappings(prev => ({ ...prev, [fieldId]: header }));
    };

    const isCurrencyMapped = !!mappings['currency'];

    return (
        <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="space-y-8 pb-20"
        >
            <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
                <div>
                    <h1 className="text-4xl font-bold mb-3 tracking-tight">Step 2: Column Mapping</h1>
                    <p className="text-lg text-zinc-500 max-w-2xl">
                        Align your spreadsheet headers with Data Domino's intelligence engine.
                    </p>
                </div>

                {!isCurrencyMapped && (
                    <div className="bg-amber-500/10 border border-amber-500/20 rounded-2xl p-4 flex items-center gap-4 animate-in fade-in zoom-in duration-300">
                        <div className="w-10 h-10 bg-amber-500/20 rounded-xl flex items-center justify-center text-amber-500 flex-shrink-0">
                            <AlertCircle className="h-5 w-5" />
                        </div>
                        <div>
                            <label className="block text-[10px] font-bold text-amber-500 uppercase tracking-widest mb-1">Currency Fallback</label>
                            <select
                                value={globalCurrency}
                                onChange={(e) => setGlobalCurrency(e.target.value)}
                                className="bg-transparent border-none text-white font-bold text-sm focus:ring-0 p-0 cursor-pointer"
                            >
                                <option value="INR" className="bg-zinc-900">INR - Indian Rupee</option>
                                <option value="USD" className="bg-zinc-900">USD - US Dollar</option>
                                <option value="EUR" className="bg-zinc-900">EUR - Euro</option>
                                <option value="GBP" className="bg-zinc-900">GBP - British Pound</option>
                                <option value="JPY" className="bg-zinc-900">JPY - Japanese Yen</option>
                            </select>
                        </div>
                    </div>
                )}
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                {/* Mapping Controls */}
                <div className="lg:col-span-2 space-y-4">
                    <div className="bg-zinc-900 border border-zinc-800 rounded-3xl overflow-hidden">
                        <div className="p-6 border-b border-zinc-800 bg-zinc-900/50 flex justify-between items-center">
                            <h3 className="font-bold">Field Requirements</h3>
                            <span className="text-[10px] bg-zinc-800 px-2 py-1 rounded text-zinc-400 uppercase tracking-widest font-bold">
                                {Object.keys(mappings).length} / {SYSTEM_FIELDS.length} Mapped
                            </span>
                        </div>

                        <div className="divide-y divide-zinc-800">
                            {SYSTEM_FIELDS.map((field) => (
                                <div key={field.id} className="p-6 flex items-center gap-6 group hover:bg-zinc-800/30 transition-colors">
                                    <div className="w-1/3 min-w-0">
                                        <div className="flex items-center gap-2 mb-1">
                                            <span className={cn(
                                                "font-bold text-sm truncate",
                                                field.id === 'currency' && !isCurrencyMapped ? "text-amber-500" : "text-white"
                                            )}>
                                                {field.name}
                                            </span>
                                            {field.required && <span className="text-rose-500 text-xs font-bold font-mono">*</span>}
                                        </div>
                                        <p className="text-[11px] text-zinc-500 line-clamp-1">{field.description}</p>
                                    </div>

                                    <div className="flex-1 flex items-center gap-4">
                                        <ArrowRight className="h-4 w-4 text-zinc-700" />

                                        <select
                                            value={mappings[field.id] || ''}
                                            onChange={(e) => handleMap(field.id, e.target.value)}
                                            className={cn(
                                                "flex-1 bg-zinc-950 border rounded-xl py-2 px-4 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 transition-all cursor-pointer",
                                                mappings[field.id]
                                                    ? "border-primary/50 text-white"
                                                    : "border-zinc-800 text-zinc-500"
                                            )}
                                        >
                                            <option value="">Select source column...</option>
                                            {headers.map(h => (
                                                <option key={h} value={h}>{h}</option>
                                            ))}
                                        </select>

                                        <div className="w-6 h-6 flex items-center justify-center">
                                            {mappings[field.id] ? (
                                                <Check className="h-4 w-4 text-emerald-500" />
                                            ) : field.id === 'currency' ? (
                                                <HelpCircle className="h-4 w-4 text-amber-500" />
                                            ) : field.required ? (
                                                <AlertCircle className="h-4 w-4 text-rose-500/50" />
                                            ) : (
                                                <HelpCircle className="h-4 w-4 text-zinc-700" />
                                            )}
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>

                {/* Info & Actions */}
                <div className="space-y-6">
                    <div className="bg-zinc-900/50 border border-zinc-800 rounded-3xl p-6">
                        <h4 className="text-sm font-bold text-zinc-400 mb-4 uppercase tracking-widest">Inferred Mapping</h4>
                        <p className="text-sm text-zinc-500 mb-6 leading-relaxed">
                            Our AI has automatically matched <span className="text-primary font-bold">{Object.keys(mappings).length} fields</span> based on common procurement naming conventions.
                        </p>
                        <div className="space-y-3">
                            {Object.entries(mappings).slice(0, 3).map(([fieldId, header]) => (
                                <div key={fieldId} className="flex items-center gap-3 p-3 bg-primary/5 rounded-xl border border-primary/10">
                                    <div className="h-2 w-2 rounded-full bg-primary" />
                                    <span className="text-xs text-zinc-300">"{header}" → {SYSTEM_FIELDS.find(f => f.id === fieldId)?.name}</span>
                                </div>
                            ))}
                        </div>
                    </div>

                    {!isCurrencyMapped && (
                        <div className="bg-zinc-900 border border-amber-500/30 p-6 rounded-3xl">
                            <h4 className="text-sm font-bold text-amber-500 mb-2">Note on Currency</h4>
                            <p className="text-xs text-zinc-500 leading-relaxed">
                                Since no currency column is mapped, all transactions will be processed using <span className="text-white font-bold">{globalCurrency}</span> as the base.
                            </p>
                        </div>
                    )}

                    <button
                        onClick={() => onConfirm(mappings, globalCurrency)}
                        className="w-full bg-primary hover:bg-primary/90 text-white p-4 rounded-2xl font-bold flex items-center justify-center gap-2 transition-all shadow-xl shadow-primary/20"
                    >
                        <Save className="h-5 w-5" /> Confirm Mapping
                    </button>
                </div>
            </div>
        </motion.div>
    );
};

export default ColumnMapper;
