import React, { useState } from 'react';
import { ArrowRight, Check, AlertCircle, HelpCircle, Save, FolderOpen, Trash2, Wallet } from 'lucide-react';
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
    { id: 'category_l1', name: 'Category L1', required: false, description: 'High-level procurement category.' },
    { id: 'category_l2', name: 'Category L2', required: false, description: 'Mid-level procurement category.' },
    { id: 'category_l3', name: 'Category L3', required: false, description: 'Detailed procurement category.' },
    { id: 'gl_account', name: 'GL Account', required: false, description: 'General Ledger account code.' },
    { id: 'plant', name: 'Plant Name', required: false, description: 'Manufacturing or storage facility name.' },
    { id: 'location', name: 'Location', required: false, description: 'Geographic location or branch.' },
    { id: 'business_unit', name: 'Business Unit', required: false, description: 'Internal division or business entity.' },
    { id: 'buyer', name: 'User/Buyer', required: false, description: 'Person or department responsible.' },
    { id: 'po_number', name: 'PO Number', required: false, description: 'Purchase Order identifier.' },
    { id: 'contract_ref', name: 'Contract Ref', required: false, description: 'Identifier for a valid contract.' },
    { id: 'item_description', name: 'Item Description', required: false, description: 'Part name, SKU, or clear description.' },
    { id: 'quantity', name: 'Quantity', required: false, description: 'Number of units purchased.' },
    { id: 'unit_price', name: 'Unit Price', required: false, description: 'Price per unit.' },
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
            if (h.includes('cat') || h.includes('dept')) initial['category_l1'] = header;
            if (h.includes('po') || h.includes('order')) initial['po_number'] = header;
            if (h.includes('plant') || h.includes('facility')) initial['plant'] = header;
            if (h.includes('loc') || h.includes('city') || h.includes('region')) initial['location'] = header;
            if (h.includes('bu') || h.includes('unit') || h.includes('division')) initial['business_unit'] = header;
            if (h.includes('contract') || h.includes('agreement')) initial['contract_ref'] = header;
            if (h.includes('item') || h.includes('desc') || h.includes('sku') || h.includes('part')) initial['item_description'] = header;
        });

        return initial;
    });
    const [globalCurrency, setGlobalCurrency] = useState('INR');
    const [templates, setTemplates] = useState<Record<string, Record<string, string>>>(() => {
        const saved = localStorage.getItem('domino_mapping_templates');
        return saved ? JSON.parse(saved) : {};
    });
    const [templateName, setTemplateName] = useState('');

    const handleMap = (fieldId: string, header: string) => {
        setMappings(prev => ({ ...prev, [fieldId]: header }));
    };

    const saveTemplate = () => {
        if (!templateName.trim()) return;
        const newTemplates = { ...templates, [templateName]: mappings };
        setTemplates(newTemplates);
        localStorage.setItem('domino_mapping_templates', JSON.stringify(newTemplates));
        setTemplateName('');
        alert(`Template "${templateName}" saved!`);
    };

    const loadTemplate = (name: string) => {
        setMappings(templates[name]);
    };

    const deleteTemplate = (name: string) => {
        const newTemplates = { ...templates };
        delete newTemplates[name];
        setTemplates(newTemplates);
        localStorage.setItem('domino_mapping_templates', JSON.stringify(newTemplates));
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

                                        {field.id === 'currency' ? (
                                            <div className="flex-1 relative">
                                                <select
                                                    value={globalCurrency}
                                                    onChange={(e) => setGlobalCurrency(e.target.value)}
                                                    className="w-full bg-zinc-950 border border-primary/50 rounded-xl py-2 px-4 text-sm text-primary font-bold focus:outline-none focus:ring-2 focus:ring-primary/50 transition-all cursor-pointer appearance-none"
                                                >
                                                    <option value="INR">INR - Indian Rupee (₹)</option>
                                                    <option value="USD">USD - US Dollar ($)</option>
                                                    <option value="EUR">EUR - Euro (€)</option>
                                                    <option value="GBP">GBP - British Pound (£)</option>
                                                    <option value="JPY">JPY - Japanese Yen (¥)</option>
                                                </select>
                                                <Wallet className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-primary pointer-events-none" />
                                            </div>
                                        ) : (
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
                                        )}

                                        <div className="w-6 h-6 flex items-center justify-center">
                                            {field.id === 'currency' ? (
                                                <Check className="h-4 w-4 text-emerald-500" />
                                            ) : mappings[field.id] ? (
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
                            {Object.entries(mappings).slice(0, 3).map(([fieldId, header]) => {
                                const field = SYSTEM_FIELDS.find(f => f.id === fieldId);
                                if (!field) return null;
                                return (
                                    <div key={fieldId} className="flex items-center gap-3 p-3 bg-primary/5 rounded-xl border border-primary/10">
                                        <div className="h-2 w-2 rounded-full bg-primary" />
                                        <span className="text-xs text-zinc-300">"{header}" → {field.name}</span>
                                    </div>
                                );
                            })}
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

                    {/* Mapping Templates */}
                    <div className="bg-zinc-900 border border-zinc-800 p-6 rounded-3xl">
                        <h4 className="text-sm font-bold text-zinc-400 mb-4 uppercase tracking-widest flex items-center gap-2">
                            <FolderOpen className="h-4 w-4" /> Mapping Templates
                        </h4>

                        <div className="space-y-4">
                            <div className="flex gap-2">
                                <input
                                    type="text"
                                    placeholder="New template name..."
                                    value={templateName}
                                    onChange={(e) => setTemplateName(e.target.value)}
                                    className="flex-1 bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:ring-1 focus:ring-primary"
                                />
                                <button
                                    onClick={saveTemplate}
                                    disabled={!templateName.trim() || Object.keys(mappings).length === 0}
                                    className="p-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-400 hover:text-white rounded-xl transition-colors disabled:opacity-50"
                                >
                                    <Save className="h-4 w-4" />
                                </button>
                            </div>

                            {Object.keys(templates).length > 0 ? (
                                <div className="space-y-2 max-h-40 overflow-y-auto pr-2 custom-scrollbar">
                                    {Object.keys(templates).map(name => (
                                        <div key={name} className="flex items-center justify-between p-2 bg-zinc-950 rounded-lg group">
                                            <button
                                                onClick={() => loadTemplate(name)}
                                                className="text-xs font-medium text-zinc-400 hover:text-primary transition-colors truncate text-left flex-1"
                                            >
                                                {name}
                                            </button>
                                            <button
                                                onClick={() => deleteTemplate(name)}
                                                className="opacity-0 group-hover:opacity-100 p-1 text-zinc-600 hover:text-red-500 transition-all"
                                            >
                                                <Trash2 className="h-3 w-3" />
                                            </button>
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                <p className="text-[10px] text-zinc-600 italic">No saved templates</p>
                            )}
                        </div>
                    </div>

                    <button
                        onClick={() => onConfirm(mappings, globalCurrency)}
                        className="w-full bg-primary hover:bg-primary/90 text-white p-4 rounded-2xl font-bold flex items-center justify-center gap-2 transition-all shadow-xl shadow-primary/20 mt-6"
                    >
                        <Save className="h-5 w-5" /> Confirm Mapping
                    </button>
                </div>
            </div>
        </motion.div>
    );
};

export default ColumnMapper;
