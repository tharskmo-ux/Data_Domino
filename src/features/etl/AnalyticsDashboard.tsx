import React, { useState, useMemo, useEffect } from 'react';
import {
    Filter,
    Download,
    Share2,
    ChevronRight,
    Search,
    MoreHorizontal,
    ShieldCheck,
    Target,
    CheckCircle2,
    Loader2,
    Wallet,
    Users,
    Zap,
    AlertCircle
} from 'lucide-react';
import { ExcelGenerator } from '../../utils/ExcelGenerator';
import TeamManagement from './TeamManagement';
import SupplierListModal from './SupplierListModal';
import UpgradeModal from './UpgradeModal';
import {
    ResponsiveContainer, XAxis, YAxis,
    CartesianGrid, Tooltip, PieChart, Pie, Cell, Area, AreaChart
} from 'recharts';
import { useProjects } from '../projects/ProjectContext';
import { motion, AnimatePresence } from 'framer-motion';
import { cn, parseDateValue } from '../../lib/utils';
import TransactionDrilldown from './TransactionDrilldown';
import SourcingDrilldown from './SourcingDrilldown';
import SupplierSummaryDrilldown from './SupplierSummaryDrilldown';
import SummaryDrilldown from './SummaryDrilldown';

interface AnalyticsDashboardProps {
    data: any[];
    mappings: Record<string, string>;
    clusters: any[];
    initialTab?: 'overview' | 'suppliers' | 'savings' | 'categorization';
    currency?: string;
    projectStats?: any;
}

const AnalyticsDashboard: React.FC<AnalyticsDashboardProps> = ({ data, mappings, clusters, initialTab = 'overview', currency = 'INR' }) => {
    const { currentProject, addActivity } = useProjects();
    const [isTeamModalOpen, setIsTeamModalOpen] = useState(false);
    const [isGeneratingPDF, setIsGeneratingPDF] = useState(false);
    const [activeTab, _setActiveTab] = useState<'overview' | 'suppliers' | 'exports' | 'savings' | 'categorization'>(initialTab as any);
    const [dateRange, setDateRange] = useState<'ALL' | '12M' | '6M' | 'YTD'>('ALL');
    const [vendorSearch, setVendorSearch] = useState('');
    const [activeSpendType, setActiveSpendType] = useState<'Direct' | 'Indirect' | null>(null);
    const [hoveredSpendType, setHoveredSpendType] = useState<'Direct' | 'Indirect' | null>(null);
    const [drilldownKpi, setDrilldownKpi] = useState<any | null>(null);
    const [isFilterOpen, setIsFilterOpen] = useState(false);

    // Supplier Modal State
    const [isSupplierModalOpen, setIsSupplierModalOpen] = useState(false);
    const [supplierModalData, setSupplierModalData] = useState<any[]>([]);

    // Upgrade Modal State
    const [isUpgradeModalOpen, setIsUpgradeModalOpen] = useState(false);
    const [upgradeModalProps, setUpgradeModalProps] = useState<{ title?: string, description?: React.ReactNode }>({});

    const openUpgradeModal = (title?: string, description?: React.ReactNode) => {
        setUpgradeModalProps({
            title: title || "Premium Feature",
            description: description || "Exporting detailed reports and executive summaries is available exclusively on the Enterprise Plan."
        });
        setIsUpgradeModalOpen(true);
    };

    const [filters, setFilters] = useState({
        supplier: '',
        category: '',
        minAmount: '',
        maxAmount: ''
    });
    const [isHistoryOpen, setIsHistoryOpen] = useState(false);
    const [expandedCards, setExpandedCards] = useState<Set<string>>(new Set());
    const [clickTimeout, setClickTimeout] = useState<any>(null);
    const historyRef = React.useRef<HTMLDivElement>(null);

    // Close History Dropdown on Outside Click
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (historyRef.current && !historyRef.current.contains(event.target as Node)) {
                setIsHistoryOpen(false);
            }
        };

        if (isHistoryOpen) {
            document.addEventListener('mousedown', handleClickOutside);
        }
        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
        };
    }, [isHistoryOpen]);

    const toggleCardExpansion = (id: string) => {
        setExpandedCards(prev => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    };

    const handleKpiInteraction = (card: any) => {
        // Special Case for Suppliers - Open Modal
        if (card.id === 'suppliers') {
            setSupplierModalData(card.data || []);
            setIsSupplierModalOpen(true);
            return;
        }

        if (!card.data) return;

        if (clickTimeout) {
            // Double click detected
            clearTimeout(clickTimeout);
            setClickTimeout(null);
            setDrilldownKpi(card);
        } else {
            // Potential single click
            const timeout = setTimeout(() => {
                setClickTimeout(null);
                toggleCardExpansion(card.id);
            }, 300);
            setClickTimeout(timeout);
        }
    };

    const filteredClusters = useMemo(() => {
        return clusters.filter(s =>
            s.masterName.toLowerCase().includes(vendorSearch.toLowerCase()) ||
            (s.category && s.category.toLowerCase().includes(vendorSearch.toLowerCase()))
        );
    }, [clusters, vendorSearch]);

    const dynamicStats = useMemo(() => {
        const amountCol = mappings['amount'];
        // Prioritize L1 for the main dashboard view, fallback to legacy 'category'
        const catCol = mappings['category_l1'] || mappings['category'];
        const dateCol = mappings['date'];


        const filteredRows = data.filter(row => {
            const supplier = String(row[mappings['supplier']] || '').toLowerCase();
            const category = String(row[catCol] || '').toLowerCase();
            const amount = parseFloat(String(row[amountCol] || '0').replace(/[^0-9.-]+/g, "")) || 0;

            if (filters.supplier && !supplier.includes(filters.supplier.toLowerCase())) return false;
            if (filters.category && !category.includes(filters.category.toLowerCase())) return false;
            if (filters.minAmount && amount < parseFloat(filters.minAmount)) return false;
            if (filters.maxAmount && amount > parseFloat(filters.maxAmount)) return false;
            return true;
        });

        // Calculate totals from filtered rows
        const stats = filteredRows.reduce((acc, row) => {
            const amount = parseFloat(String(row[amountCol] || '0').replace(/[^0-9.-]+/g, "")) || 0;
            return {
                spend: acc.spend + amount,
                count: acc.count + 1
            };
        }, { spend: 0, count: 0 });

        const totalSpend = stats.spend;
        const vendorCount = clusters.length > 0 ? clusters.length : new Set(filteredRows.map(r => String(r[mappings['supplier']] || ''))).size;

        // 0. Global Pre-calculation for Item Details (Min Price & Sourcing Status)
        // We need this from the FULL dataset 'data' to ensure 'Single Source' and 'Min Price' are accurate globally,
        // even when filters are applied.
        const globalItemStats: Record<string, { minPrice: number, bestSupplier: string, supplierCount: number, suppliers: Set<string> }> = {};

        data.forEach(row => {
            const item = String(row[mappings['item_description']] || '').trim();
            if (!item) return;
            const unitPrice = parseFloat(String(row[mappings['unit_price']] || '0').replace(/[^0-9.-]+/g, ""));
            const supplier = String(row[mappings['supplier']] || '');

            if (!globalItemStats[item]) {
                globalItemStats[item] = { minPrice: unitPrice || Infinity, bestSupplier: supplier, supplierCount: 0, suppliers: new Set() };
            }

            globalItemStats[item].suppliers.add(supplier);

            if (unitPrice > 0 && unitPrice < globalItemStats[item].minPrice) {
                globalItemStats[item].minPrice = unitPrice;
                globalItemStats[item].bestSupplier = supplier;
            }
        });

        // Update counts based on unique suppliers found
        Object.values(globalItemStats).forEach(stat => {
            stat.supplierCount = stat.suppliers.size;
            // Fix logic: if minPrice never set (all 0), reset or keep Infinity? Keep Infinity to avoid variance calc.
            if (stat.minPrice === Infinity) stat.minPrice = 0;
        });


        // 1. Fiscal Year & Time Period Analysis
        const now = new Date();
        const getFY = (date: Date) => {
            const y = date.getFullYear();
            return date.getMonth() >= 3 ? y : y - 1; // April start
        };
        const currentFY = getFY(now);

        let fySpend = 0;
        let ytdSpend = 0;
        let lySpend = 0;

        // 2. Business Unit & Location Distributions
        const buCol = mappings['business_unit'] || mappings['plant'];
        const locCol = mappings['location'] || mappings['plant'];
        const buMap: Record<string, number> = {};
        const locMap: Record<string, number> = {};
        const poSet = new Set<string>();
        let compliantSpend = 0;

        // Calculate distribution maps
        const catMap: Record<string, number> = {};
        const spendTypeMap = { Direct: 0, Indirect: 0 };
        const monthMap: Record<string, { spend: number, compliance: number, count: number, label: string, timestamp: number }> = {};

        // 3. Sourcing Strategy Logic (Single vs Multi Source) - Local View
        let itemCol = mappings['item_description'];

        // Auto-detect fallback if not explicitly mapped
        if (!itemCol && data.length > 0) {
            const potentialColumns = Object.keys(data[0]);
            itemCol = potentialColumns.find(c => /item|material|description|part|sku|product/i.test(c)) || '';
        }

        const isItemMapped = !!itemCol;
        const itemMap: Record<string, { spend: number, suppliers: Set<string>, vendorDetails: Record<string, number> }> = {};

        const supplierStatsMap: Record<string, { spend: number, count: number, category: string }> = {};

        // Real Savings Calculation Accumulators
        let totalIdentifiedSavings = 0;
        const savingsBreakdown = {
            priceVariance: 0,
            singleSource: 0,
            compliance: 0,
            tailSpend: 0,
            processEfficiency: 0
        };

        // Identify Tail Suppliers (Global Set for consistency or Local? Let's use Global for 'True' Tail definition)
        // Actually, Tail Spend is relative to total spend. Let's calculate Tail Spend threshold from Global Data first? 
        // No, usually analyzed on the dataset in hand. But for consistency with Export (which uses filtered view if we adapt it, or global), 
        // let's define Tail Suppliers based on the *current filtered view* for the dashboard stats. 
        // Wait, User asked for consistency. If I filter to "Top Supplier", savings should be 0 because it's not Tail. 
        // Let's defer Tail identification until after we sum up supplier stats from filteredRows.
        // BUT we are iterating filteredRows NOW.
        // Let's do a 2-pass approach or just use the Global Tail definition for robustness.
        const globalSupplierSpend: Record<string, number> = {};
        data.forEach(r => {
            const s = String(r[mappings['supplier']] || '');
            const amt = parseFloat(String(r[amountCol] || '0').replace(/[^0-9.-]+/g, "")) || 0;
            globalSupplierSpend[s] = (globalSupplierSpend[s] || 0) + amt;
        });
        const globalSortedSuppliers = Object.entries(globalSupplierSpend).sort((a, b) => a[1] - b[1]); // Ascending
        let globalCumSpend = 0;
        const globalTotalSpend = Object.values(globalSupplierSpend).reduce((a, b) => a + b, 0);
        const globalTailThreshold = globalTotalSpend * 0.2;
        const globalTailSet = new Set<string>();
        for (const [s, amt] of globalSortedSuppliers) {
            if (globalCumSpend + amt <= globalTailThreshold) {
                globalTailSet.add(s);
                globalCumSpend += amt;
            } else break;
        }


        filteredRows.forEach(row => {
            const cat = row[catCol] || 'Uncategorized';
            const amount = parseFloat(String(row[amountCol] || '0').replace(/[^0-9.-]+/g, "")) || 0;
            const supplier = String(row[mappings['supplier']] || '');
            const item = String(row[itemCol] || '').trim();
            const unitPrice = parseFloat(String(row[mappings['unit_price']] || '0').replace(/[^0-9.-]+/g, "")) || 0;
            const quantity = parseFloat(String(row[mappings['quantity']] || '0').replace(/[^0-9.-]+/g, "")) || 0;
            const contract = String(row[mappings['contract_ref']] || '').trim();

            catMap[cat] = (catMap[cat] || 0) + amount;

            if (supplier) {
                if (!supplierStatsMap[supplier]) supplierStatsMap[supplier] = { spend: 0, count: 0, category: String(cat) };
                supplierStatsMap[supplier].spend += amount;
                supplierStatsMap[supplier].count += 1;
            }

            // Group by Item for Sourcing Analysis (Local)
            if (itemCol) {
                const sup = String(row[mappings['supplier']] || 'Unknown Supplier');
                if (!itemMap[item]) itemMap[item] = { spend: 0, suppliers: new Set(), vendorDetails: {} };
                itemMap[item].spend += amount;
                itemMap[item].suppliers.add(sup);
                itemMap[item].vendorDetails[sup] = (itemMap[item].vendorDetails[sup] || 0) + amount;
            }

            // --- Real Savings Logic (Prioritized) ---
            let rowSavings = 0;
            let logicType: keyof typeof savingsBreakdown | null = null;

            // 1. Price Variance
            if (item && globalItemStats[item] && globalItemStats[item].supplierCount > 1 && unitPrice > globalItemStats[item].minPrice) {
                const bestPrice = globalItemStats[item].minPrice;
                const impliedQty = quantity || (unitPrice > 0 ? amount / unitPrice : 0);
                const variance = (unitPrice - bestPrice) * impliedQty;
                if (variance > 0) {
                    rowSavings = variance;
                    logicType = 'priceVariance';
                }
            }

            // 2. Single Source Risk (Only if no Price Variance)
            if (rowSavings === 0 && item && globalItemStats[item] && globalItemStats[item].supplierCount === 1) {
                // For Single Source, savings is 'Potential' - often estimated as 2-5% benefit of multi-sourcing.
                // Let's use 2% of spend.
                rowSavings = amount * 0.02;
                logicType = 'singleSource';
            }

            // 3. Contract Compliance
            if (rowSavings === 0 && !contract) {
                // Off-contract spend - potential 5% savings from negotiating contract
                rowSavings = amount * 0.05;
                logicType = 'compliance';
            }

            // 4. Tail Spend
            if (rowSavings === 0 && globalTailSet.has(supplier)) {
                // Tail spend consolidation - potential 10% process/price savings
                rowSavings = amount * 0.10;
                logicType = 'tailSpend';
            }

            // 5. Low Value PO
            if (rowSavings === 0 && amount < 5000) {
                // Process efficiency - fixed cost saving per PO? Let's say flat ₹500
                rowSavings = 500;
                logicType = 'processEfficiency';
            }

            if (rowSavings > 0 && logicType) {
                totalIdentifiedSavings += rowSavings;
                savingsBreakdown[logicType] += rowSavings;
            }


            // 1. FY & YTD Population
            if (dateCol && row[dateCol]) {
                const date = parseDateValue(row[dateCol]);
                if (date) {
                    const itemFY = getFY(date);
                    if (itemFY === currentFY) fySpend += amount;
                    if (itemFY === currentFY - 1) lySpend += amount;
                    if (itemFY === currentFY && date <= now) ytdSpend += amount;

                    const yyyy = date.getFullYear();
                    const mm = String(date.getMonth() + 1).padStart(2, '0');
                    const monthKey = `${yyyy}-${mm}`;
                    if (!monthMap[monthKey]) {
                        monthMap[monthKey] = {
                            spend: 0,
                            compliance: 0,
                            count: 0,
                            label: date.toLocaleString('en-US', { month: 'short', year: '2-digit' }),
                            timestamp: date.getTime()
                        };
                    }
                    monthMap[monthKey].spend += amount;
                    monthMap[monthKey].count += 1;
                }
            }

            // 2. BU & Location Population
            const bu = row[buCol] || 'Corporate';
            const loc = row[locCol] || 'Headquarters';
            buMap[bu] = (buMap[bu] || 0) + amount;
            locMap[loc] = (locMap[loc] || 0) + amount;

            // 3. PO & Compliance Population
            if (row[mappings['po_number']]) poSet.add(String(row[mappings['po_number']]));
            if (row[mappings['contract_ref']]) compliantSpend += amount;

            // Spend Type Heuristic
            const isDirect = /material|factory|production|logistics|freight|packaging|raw|component/i.test(cat);
            spendTypeMap[isDirect ? 'Direct' : 'Indirect'] += amount;
        });

        // Finalize Sourcing Stats
        const singleSourceItems = Object.entries(itemMap).filter(([_, i]) => i.suppliers.size === 1);
        const multiSourceItems = Object.entries(itemMap).filter(([_, i]) => i.suppliers.size > 1);
        const singleSpend = singleSourceItems.reduce((acc, [_, i]) => acc + i.spend, 0);
        const multiSpend = multiSourceItems.reduce((acc, [_, i]) => acc + i.spend, 0);
        const sourcingData = {
            singleSpend,
            multiSpend,
            singlePercent: totalSpend > 0 ? Math.round((singleSpend / totalSpend) * 100) : 0,
            multiPercent: totalSpend > 0 ? Math.round((multiSpend / totalSpend) * 100) : 0,
            singleItems: singleSourceItems.map(([name, i]) => ({ name, spend: i.spend, supplier: Array.from(i.suppliers)[0] })),
            multiItems: multiSourceItems.map(([name, i]) => ({ name, spend: i.spend, vendors: i.vendorDetails }))
        };

        // Sort chronologically and filter dates
        const timestamps = filteredRows.map(r => parseDateValue(r[dateCol])?.getTime() || 0).filter(t => t > 0);
        const maxTimestamp = timestamps.length > 0 ? timestamps.reduce((max, t) => Math.max(max, t), 0) : now.getTime();
        const maxDate = new Date(maxTimestamp);

        const sortedMonths = Object.values(monthMap).sort((a, b) => a.timestamp - b.timestamp);
        const filteredMonths = sortedMonths.filter(m => {
            if (m.label === 'Other') return false;
            if (dateRange === 'ALL') return true;
            const itemDate = new Date(m.timestamp);
            const diffMonths = (maxDate.getFullYear() - itemDate.getFullYear()) * 12 + (maxDate.getMonth() - itemDate.getMonth());
            if (dateRange === '12M') return diffMonths < 12;
            if (dateRange === '6M') return diffMonths < 6;
            if (dateRange === 'YTD') return itemDate.getFullYear() === maxDate.getFullYear();
            return true;
        });

        const spendHistory = filteredMonths.map((stats, index) => {
            const prevSpend = index > 0 ? filteredMonths[index - 1].spend : null;
            const growth = prevSpend ? ((stats.spend - prevSpend) / prevSpend) * 100 : 0;
            return { month: stats.label, spend: stats.spend, growth };
        });



        const categoryData = Object.entries(catMap)
            .map(([name, value]) => ({
                name,
                value: Math.round((value / (totalSpend || 1)) * 100),
                rawSpend: value,
                type: /material|factory|production|logistics|freight|packaging|raw|component/i.test(name) ? 'Direct' : 'Indirect',
                color: `#${Math.floor(Math.random() * 16777215).toString(16).padStart(6, '0')} `
            }))
            .sort((a, b) => b.value - a.value);

        const spendTypeData = [
            { name: 'Direct', value: Math.round((spendTypeMap.Direct / totalSpend) * 100) || 0, color: '#0d9488' },
            { name: 'Indirect', value: Math.round((spendTypeMap.Indirect / totalSpend) * 100) || 0, color: '#f43f5e' }
        ].filter(i => i.value > 0);

        const identifiedSavings = totalIdentifiedSavings;

        const supplierSummaryBySpend = Object.entries(supplierStatsMap).map(([name, stats]) => ({
            [mappings['supplier']]: name,
            [mappings['category_l1'] || mappings['category'] || 'category']: stats.category,
            [mappings['amount']]: stats.spend,
            '_transactions': stats.count
        })).sort((a, b) => (b[mappings['amount']] as number) - (a[mappings['amount']] as number));

        const topSuppliers = supplierSummaryBySpend.slice(0, 5).map(s => ({
            name: s[mappings['supplier']],
            value: s[mappings['amount']] as number,
            share: Math.round(((s[mappings['amount']] as number) / totalSpend) * 100)
        }));

        const avgPOValue = poSet.size > 0 ? totalSpend / poSet.size : totalSpend;
        const complianceScore = Math.round((compliantSpend / (totalSpend || 1)) * 100);
        const vsLYGrowth = lySpend > 0 ? ((fySpend - lySpend) / lySpend) * 100 : 0;

        // Tail Spend Pareto
        const sortedSuppliersBySpend = Object.entries(supplierStatsMap)
            .map(([name, stats]) => ({ name, spend: stats.spend }))
            .sort((a, b) => a.spend - b.spend);

        let cumulativeSpend = 0;
        const tailSuppliersList = [];
        const tailThreshold = totalSpend * 0.2;
        for (const s of sortedSuppliersBySpend) {
            if (cumulativeSpend + s.spend <= tailThreshold || tailSuppliersList.length === 0) {
                tailSuppliersList.push(s.name);
                cumulativeSpend += s.spend;
            } else break;
        }
        const tailSuppliersSet = new Set(tailSuppliersList);
        const tailSpendPercentage = Math.round((cumulativeSpend / (totalSpend || 1)) * 1000) / 10;

        const buSummary = Object.entries(buMap)
            .map(([name, value]) => ({
                name,
                value,
                share: totalSpend > 0 ? (value / totalSpend) * 100 : 0
            }))
            .sort((a, b) => b.value - a.value);

        const locSummary = Object.entries(locMap)
            .map(([name, value]) => ({
                name,
                value,
                share: totalSpend > 0 ? (value / totalSpend) * 100 : 0
            }))
            .sort((a, b) => b.value - a.value);

        const savingsLevers = [
            { id: 'vol', name: "Volume-based discounting", baseProb: 75, color: "#14b8a6" },
            { id: 'long', name: "Long-term fixed or index-linked contracts", baseProb: 65, color: "#0d9488" },
            { id: 'rev', name: "Reverse and expressive bidding", baseProb: 40, color: "#0f766e" },
            { id: 'cost', name: "Should-cost analysis", baseProb: 70, color: "#115e59" },
            { id: 'bund', name: "Bundling/Unbundling", baseProb: 55, color: "#134e4a" },
            { id: 'make', name: "Make-or-buy", baseProb: 30, color: "#155e75" },
            { id: 'lcc', name: "Low-cost country (LCC) sourcing", baseProb: 45, color: "#0e7490" },
            { id: 'pay', name: "Payment terms optimization", baseProb: 85, color: "#2dd4bf" }
        ].map(l => {
            let prob = l.baseProb;
            // Context-awareness logic
            if (l.id === 'vol' && totalSpend > 10000000) prob += 10;
            if (l.id === 'rev' && sourcingData.singlePercent > 40) prob += 15;
            if (l.id === 'bund' && tailSpendPercentage > 20) prob += 12;
            if (l.id === 'pay' && complianceScore < 60) prob += 8;
            return { ...l, probability: Math.min(prob, 98) };
        }).sort((a, b) => b.probability - a.probability);

        return {
            filteredRows, // Expose for export
            totalSpend,
            fySpend,
            ytdSpend,
            lySpend,
            totalRows: filteredRows.length,
            vendorCount,
            complianceScore: totalSpend > 0 ? Math.round((compliantSpend / totalSpend) * 100) : 0,
            buData: buSummary.slice(0, 5),
            locData: locSummary.slice(0, 5),
            buSummary,
            locSummary,
            monthData: sortedMonths,
            supplierData: topSuppliers,
            spendTypeData,
            spendHistory,
            sourcingData,
            kpis: [
                {
                    id: 'total-spend', icon: Wallet, label: 'Total Addressable Spend', value: totalSpend, type: 'currency', color: 'primary',
                    subMetrics: [{ label: `FY ${currentFY}-${(currentFY + 1) % 100}`, value: fySpend }, { label: 'YTD', value: ytdSpend }, { label: 'vs LY', value: vsLYGrowth, type: 'percent' }],
                    data: filteredRows
                },
                {
                    id: 'sourcing',
                    icon: Share2,
                    label: 'Sourcing Strategy',
                    value: isItemMapped ? '' : 'N/A',
                    type: 'raw',
                    color: isItemMapped ? 'emerald' : 'zinc',
                    topDistribution: isItemMapped ? [
                        { name: 'Single Source', share: sourcingData.singlePercent },
                        { name: 'Multi Source', share: sourcingData.multiPercent }
                    ] : [
                        { name: 'Start Setup to map Item Column', share: 0 }
                    ],
                    data: isItemMapped ? sourcingData : null
                },
                { id: 'compliance', icon: ShieldCheck, label: 'Contract Compliance', value: complianceScore, type: 'percent', color: 'emerald', data: filteredRows.filter(r => !r[mappings['contract_ref']]) },
                {
                    id: 'suppliers', icon: Users, label: 'Spend by Suppliers', value: vendorCount, type: 'number', color: 'teal',
                    subMetrics: [{ label: 'Top 5 Share', value: topSuppliers.slice(0, 5).reduce((acc, s) => acc + s.share, 0), type: 'percent' }],
                    topDistribution: topSuppliers,
                    data: supplierSummaryBySpend,
                    totalSpend: totalSpend
                },
                {
                    id: 'bu', icon: Zap, label: 'Spend by Business Unit', value: Object.keys(buMap).length, type: 'number', color: 'primary',
                    topDistribution: buSummary.slice(0, 5), data: buSummary, isSummary: true
                },
                {
                    id: 'location', icon: AlertCircle, label: 'Spend by Location', value: Object.keys(locMap).length, type: 'number', color: 'rose',
                    topDistribution: locSummary.slice(0, 5), data: locSummary, isSummary: true
                },
                { id: 'avg-po', icon: Target, label: 'Average PO Value', value: avgPOValue, type: 'currency', color: 'amber', data: filteredRows },
                { id: 'tail-spend', icon: AlertCircle, label: 'Tail Spend', value: tailSpendPercentage, type: 'percent', color: 'rose', data: filteredRows.filter(row => tailSuppliersSet.has(String(row[mappings['supplier']] || '').trim())) },
            ],
            opportunities: clusters
                .map(s => {
                    let priority = 0;
                    let action = 'Strategic Review';
                    if (s.variants.length > 1) {
                        priority += s.variants.length * 10;
                        action = s.variants.length > 2 ? 'Consolidation' : 'Price Leveling';
                    }
                    if (s.totalSpend > totalSpend * 0.05) priority += 50;
                    return { ...s, priority, action };
                })
                .filter(s => s.priority > 0)
                .sort((a, b) => b.priority - a.priority)
                .slice(0, 5),
            categoryData,
            identifiedSavings,
            savingsLevers,
            savingsBreakdown,
            // Internal structures needed for export
            itemMap,
            supplierSummaryBySpend
        };
    }, [data, mappings, clusters, dateRange, filters]);

    const formatCurrency = (val: number, isCompact = true) => {
        if (currency === 'INR' && isCompact) {
            if (val >= 10000000) return `₹${(val / 10000000).toFixed(1)} Cr`;
            if (val >= 100000) return `₹${(val / 100000).toFixed(1)} L`;
        }
        return new Intl.NumberFormat('en-IN', {
            style: 'currency',
            currency: currency,
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
        if (type === 'percent') return `${typeof val === 'number' ? val.toFixed(1) : val}%`;
        return val;
    };

    const handleExportExcel = async () => {
        const rowsToExport = dynamicStats?.filteredRows || data;
        if (!rowsToExport || rowsToExport.length === 0) {
            alert("No data available to export.");
            return;
        }

        setIsGeneratingPDF(true);

        try {
            const generator = new ExcelGenerator(rowsToExport, mappings, currency);
            const blob = await generator.generate();

            // 2. Create Download Link
            const url = URL.createObjectURL(blob);
            const link = document.createElement("a");
            const filename = `Procurement_Analysis_${new Date().toISOString().split('T')[0]}.xlsx`;

            link.setAttribute("href", url);
            link.setAttribute("download", filename);
            document.body.appendChild(link);

            // 3. Trigger Download
            link.click();
            document.body.removeChild(link);
            URL.revokeObjectURL(url);

            // 4. Log Activity
            addActivity(currentProject?.id || '', {
                type: 'export',
                label: filename,
                details: 'Comprehensive Excel export with 7-sheet analysis.'
            });
        } catch (error) {
            console.error('Export failed:', error);
            alert('Failed to generate Excel report. Please try again.');
        } finally {
            setIsGeneratingPDF(false);
        }
    };


    const [isSharedView, setIsSharedView] = useState(false);

    useEffect(() => {
        const params = new URLSearchParams(window.location.search);
        if (params.get('share')) {
            setIsSharedView(true);
        }
    }, []);

    return (
        <>
            {isSharedView && (
                <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    className="bg-primary/10 border-b border-primary/20 p-2 text-center"
                >
                    <p className="text-[10px] font-bold uppercase tracking-widest text-primary flex items-center justify-center gap-2">
                        <Users className="h-3 w-3" /> Guest Access Mode • View Only
                    </p>
                </motion.div>
            )}
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
                    </div>
                </div>

                <div className="flex gap-4">
                    <button
                        onClick={() => setIsFilterOpen(!isFilterOpen)}
                        className={cn(
                            "px-5 py-3 rounded-2xl font-bold flex items-center gap-2 transition-all border active:scale-[0.98]",
                            isFilterOpen ? "bg-primary text-white border-primary" : "bg-zinc-900 border-zinc-800 text-white hover:bg-zinc-800"
                        )}
                    >
                        <Filter className="h-4 w-4" /> Filters {Object.values(filters).some(v => v) && "•"}
                    </button>
                    <button
                        onClick={() => setIsTeamModalOpen(true)}
                        className="bg-zinc-900 hover:bg-zinc-800 text-white px-5 py-3 rounded-2xl font-bold flex items-center gap-2 transition-all border border-zinc-800 active:scale-[0.98]"
                    >
                        <Share2 className="h-4 w-4" /> Share Report
                    </button>
                    <button
                        onClick={handleExportExcel}
                        disabled={isGeneratingPDF}
                        className={cn(
                            "bg-white hover:bg-zinc-200 text-black px-6 py-3 rounded-2xl font-bold flex items-center gap-2 transition-all shadow-xl shadow-white/5 active:scale-[0.98]",
                            isGeneratingPDF && "opacity-70 cursor-not-allowed"
                        )}
                    >
                        {isGeneratingPDF ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                            <Download className="h-4 w-4" />
                        )}
                        Export Analysis (Excel)
                    </button>
                    <div className="relative" ref={historyRef}>
                        <button
                            onClick={() => setIsHistoryOpen(!isHistoryOpen)}
                            className="bg-zinc-950 hover:bg-zinc-900 text-zinc-500 hover:text-white p-3 rounded-2xl border border-zinc-900 transition-all flex items-center gap-2"
                            title="Export History"
                        >
                            <MoreHorizontal className="h-5 w-5" />
                            {currentProject && (currentProject.activities || []).filter((a: any) => a.type === 'export').length > 0 && (
                                <span className="p-1 bg-primary rounded-full" />
                            )}
                        </button>

                        <AnimatePresence>
                            {isHistoryOpen && (
                                <motion.div
                                    initial={{ opacity: 0, scale: 0.95, y: 10 }}
                                    animate={{ opacity: 1, scale: 1, y: 0 }}
                                    exit={{ opacity: 0, scale: 0.95, y: 10 }}
                                    className="absolute right-0 top-full mt-4 w-80 bg-zinc-900 border border-zinc-800 rounded-2xl shadow-2xl z-50 overflow-hidden"
                                >
                                    <div className="p-4 border-b border-zinc-800 bg-zinc-950/50 flex justify-between items-center">
                                        <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">Export History</span>
                                        <span className="text-[10px] font-bold text-primary">
                                            {currentProject ? (currentProject.activities || []).filter((a: any) => a.type === 'export').length : 0} files
                                        </span>
                                    </div>
                                    <div className="max-h-64 overflow-y-auto divide-y divide-zinc-800">
                                        {!currentProject || (currentProject.activities || []).filter((a: any) => a.type === 'export').length === 0 ? (
                                            <div className="p-8 text-center text-zinc-600 text-[10px] font-bold uppercase tracking-widest">No recent exports</div>
                                        ) : (
                                            (currentProject.activities || []).filter((a: any) => a.type === 'export').map((item: any) => (
                                                <div key={item.id} className="p-4 hover:bg-zinc-800/50 transition-colors flex items-center justify-between group">
                                                    <div className="min-w-0">
                                                        <div className="text-xs font-bold text-white truncate">{item.label}</div>
                                                        <div className="text-[10px] text-zinc-500 mt-0.5">{new Date(item.timestamp).toLocaleString()}</div>
                                                    </div>
                                                    <button
                                                        onClick={() => openUpgradeModal()}
                                                        className="p-2 text-zinc-600 hover:text-white opacity-0 group-hover:opacity-100 transition-all"
                                                    >
                                                        <Download className="h-4 w-4" />
                                                    </button>
                                                </div>
                                            ))
                                        )}
                                    </div>
                                </motion.div>
                            )}
                        </AnimatePresence>
                    </div>
                </div>

                <AnimatePresence>
                    {isFilterOpen && (
                        <motion.div
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: 'auto', opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            className="overflow-hidden"
                        >
                            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 p-6 bg-zinc-900/30 border border-zinc-900 rounded-3xl mb-8">
                                <div className="space-y-2">
                                    <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">Supplier Search</label>
                                    <input
                                        type="text"
                                        value={filters.supplier}
                                        onChange={(e) => setFilters(prev => ({ ...prev, supplier: e.target.value }))}
                                        placeholder="Filter by vendor..."
                                        className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-2 text-xs text-white focus:ring-1 focus:ring-primary focus:border-primary focus:outline-none"
                                    />
                                </div>
                                <div className="space-y-2">
                                    <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">Category Search</label>
                                    <input
                                        type="text"
                                        value={filters.category}
                                        onChange={(e) => setFilters(prev => ({ ...prev, category: e.target.value }))}
                                        placeholder="Filter by category..."
                                        className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-2 text-xs text-white focus:ring-1 focus:ring-primary focus:border-primary focus:outline-none"
                                    />
                                </div>
                                <div className="space-y-2">
                                    <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">Min Amount</label>
                                    <input
                                        type="number"
                                        value={filters.minAmount}
                                        onChange={(e) => setFilters(prev => ({ ...prev, minAmount: e.target.value }))}
                                        placeholder="0"
                                        className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-2 text-xs text-white focus:ring-1 focus:ring-primary focus:border-primary focus:outline-none"
                                    />
                                </div>
                                <div className="space-y-2 flex flex-col justify-end">
                                    <button
                                        onClick={() => setFilters({ supplier: '', category: '', minAmount: '', maxAmount: '' })}
                                        className="w-full py-2 text-rose-500 text-[10px] font-bold uppercase tracking-widest hover:bg-rose-500/5 rounded-xl transition-all"
                                    >
                                        Clear Filters
                                    </button>
                                </div>
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>

                <AnimatePresence mode="wait">
                    {activeTab === 'overview' && (
                        <motion.div
                            key="overview"
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -20 }}
                            className="space-y-10"
                        >
                            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 mb-10">
                                <div className="lg:col-span-2 relative group overflow-hidden rounded-[2.5rem] border border-zinc-800/50 bg-zinc-900/40 p-10 flex flex-col justify-between">
                                    {/* Animated background glow */}
                                    <div className="absolute -right-20 -top-20 w-80 h-80 bg-primary/20 rounded-full blur-[100px] group-hover:bg-primary/30 transition-all duration-1000 animate-roi-pulse" />
                                    <div className="absolute -left-20 -bottom-20 w-80 h-80 bg-emerald-500/10 rounded-full blur-[100px] group-hover:bg-emerald-500/20 transition-all duration-1000" />

                                    <div className="relative z-10">
                                        <div className="flex items-center justify-between mb-6 relative">
                                            <div className="flex items-center gap-3">
                                                <div className="w-10 h-10 rounded-xl bg-teal-500/20 border border-teal-500/30 flex items-center justify-center text-teal-400">
                                                    <Zap className="w-5 h-5 animate-pulse" />
                                                </div>
                                                <span className="text-[10px] font-black uppercase tracking-[0.2em] text-teal-500/80">Intelligence Engine Activated</span>
                                            </div>
                                            <span className="bg-amber-500/10 text-amber-500 text-[10px] font-black px-3 py-1 rounded-full border border-amber-500/20 uppercase tracking-widest">
                                                Restricted Access
                                            </span>
                                        </div>

                                        <h2 className="text-xl font-bold text-zinc-400 mb-2">Total Potential Savings Identified</h2>
                                        <div className="flex items-baseline gap-4 mb-4 relative group/savings">
                                            <div className="relative">
                                                <h1 className="text-7xl font-black text-white tracking-tighter text-glow-primary blur-xl select-none transition-all duration-700 group-hover/savings:blur-md">
                                                    {formatCurrency(dynamicStats.identifiedSavings, false)}
                                                </h1>
                                                <div className="absolute inset-0 flex items-center justify-center">
                                                    <div className="flex flex-col items-center gap-1">
                                                        <div className="p-2 rounded-full bg-primary/20 border border-primary/30 text-primary">
                                                            <ShieldCheck className="w-6 h-6" />
                                                        </div>
                                                        <span className="text-[10px] font-black uppercase tracking-widest text-primary/80">Analysis Gated</span>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                        <p className="text-zinc-500 text-sm max-w-lg leading-relaxed mb-8 font-medium">
                                            Our intelligence engine has identified <span className="text-white">High-Impact ROI opportunities</span>. To maintain data integrity and strategic confidentiality, full savings levers are revealed via an expert consultation.
                                        </p>
                                    </div>

                                    <div className="relative z-10 flex flex-wrap gap-4 mt-auto">
                                        <button
                                            onClick={() => openUpgradeModal("Unlock Expert Analysis", "Unlock this analysis by scheduling a 15-min expert walkthrough. Our team will decrypt these savings for you.")}
                                            className="bg-primary hover:bg-teal-600 text-white px-8 py-4 rounded-2xl font-black text-xs uppercase tracking-widest transition-all shadow-xl shadow-primary/20 border border-primary/50 relative overflow-hidden group/btn active:scale-95"
                                        >
                                            <span className="relative z-10 flex items-center gap-2">
                                                Unlock Analysis with Experts
                                                <ChevronRight className="w-4 h-4 group-hover/btn:translate-x-1 transition-transform" />
                                            </span>
                                            <div className="absolute inset-0 bg-white/20 translate-y-full group-hover/btn:translate-y-0 transition-transform duration-300" />
                                        </button>
                                    </div>
                                </div>

                                <div className="bg-zinc-900/40 border border-zinc-800 rounded-[2.5rem] p-8 flex flex-col justify-center relative overflow-hidden group">
                                    <div className="absolute inset-0 bg-zinc-950/40 backdrop-blur-[2px] z-20 group-hover:backdrop-blur-0 transition-all duration-700" />
                                    <div className="relative z-30 text-center py-6">
                                        <div className="w-12 h-12 rounded-2xl bg-zinc-800 border border-zinc-700 mx-auto mb-4 flex items-center justify-center text-zinc-500">
                                            <MoreHorizontal className="w-6 h-6" />
                                        </div>
                                        <h3 className="text-white font-bold text-sm mb-1 uppercase tracking-widest">Levers Gated</h3>
                                        <p className="text-[10px] text-zinc-500 font-bold px-4 leading-relaxed uppercase tracking-tighter">
                                            Savings Breakdown requires <br /> strategic calibration
                                        </p>
                                    </div>
                                    <div className="relative z-10 blur-[1px] opacity-40 group-hover:blur-none group-hover:opacity-100 transition-all duration-500 pointer-events-none select-none">
                                        <div className="space-y-4">
                                            {dynamicStats.savingsLevers.map((lever) => (
                                                <div key={lever.name} className="flex flex-col gap-1.5">
                                                    <div className="flex items-center justify-between text-[9px] font-bold uppercase tracking-tight">
                                                        <span className="text-zinc-500 truncate pr-2">{lever.name}</span>
                                                        <span className="text-zinc-400 shrink-0">{lever.probability}% Yield Probability</span>
                                                    </div>
                                                    <div className="h-1 bg-zinc-900 rounded-full overflow-hidden">
                                                        <div
                                                            className="h-full bg-primary/40 rounded-full"
                                                            style={{
                                                                width: `${lever.probability}%`,
                                                                backgroundColor: lever.color + '44'
                                                            }}
                                                        />
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                </div>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                                {dynamicStats.kpis.map((card, idx) => (
                                    <motion.div
                                        key={card.id}
                                        initial={{ opacity: 0, y: 20 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        transition={{ delay: idx * 0.05 }}
                                        onClick={() => handleKpiInteraction(card)}
                                        className={cn(
                                            "bg-zinc-900/40 border border-zinc-900 p-5 rounded-3xl transition-all group relative overflow-hidden",
                                            card.data ? "hover:border-zinc-700 cursor-pointer active:scale-[0.98]" : "cursor-default"
                                        )}
                                    >
                                        <div className="flex items-start justify-between mb-4">
                                            <div className={cn(
                                                "p-3 rounded-2xl",
                                                card.color === 'primary' ? "bg-primary/10 text-primary" :
                                                    card.color === 'amber' ? "bg-amber-500/10 text-amber-500" :
                                                        card.color === 'teal' ? "bg-teal-500/10 text-teal-500" :
                                                            card.color === 'emerald' ? "bg-emerald-500/10 text-emerald-500" :
                                                                "bg-rose-500/10 text-rose-500"
                                            )}>
                                                <card.icon className="w-6 h-6" />
                                            </div>
                                            {card.data && (
                                                <div className="opacity-0 group-hover:opacity-100 transition-opacity">
                                                    <ChevronRight className="w-5 h-5 text-zinc-600" />
                                                </div>
                                            )}
                                        </div>

                                        <div>
                                            <p className="text-zinc-500 text-[10px] font-bold uppercase tracking-widest mb-1">{card.label}</p>
                                            <h3 className="text-2xl font-bold tracking-tight text-white mb-2">
                                                {formatValue(card.value, card.type)}
                                            </h3>

                                            {/* Sub-metrics for Total Spend */}
                                            {card.subMetrics && (
                                                <div className="flex gap-4 mt-3 pt-3 border-t border-zinc-800/50">
                                                    {card.subMetrics.map((sm, i) => (
                                                        <div key={i}>
                                                            <p className="text-[10px] uppercase tracking-wider text-zinc-600 mb-0.5">{sm.label}</p>
                                                            <p className={cn(
                                                                "text-xs font-bold",
                                                                sm.type === 'percent' && sm.value > 0 ? "text-rose-500" :
                                                                    sm.type === 'percent' && sm.value < 0 ? "text-emerald-500" : "text-white"
                                                            )}>
                                                                {formatValue(sm.value, sm.type || 'currency')}
                                                            </p>
                                                        </div>
                                                    ))}
                                                </div>
                                            )}

                                            {/* Top Distribution for Categories/Suppliers/BU/Location */}
                                            {card.topDistribution && (
                                                <div className={cn(
                                                    "mt-4 space-y-2 transition-all duration-500 overflow-hidden",
                                                    expandedCards.has(card.id) ? "max-h-[500px] overflow-y-auto pr-2 custom-scrollbar" : "max-h-32"
                                                )}>
                                                    {(expandedCards.has(card.id) && Array.isArray(card.data) ? card.data.slice(0, 50) : card.topDistribution || []).map((item: any, i: number) => (
                                                        <div key={i} className="flex items-center justify-between text-[11px]">
                                                            <span className="text-zinc-500 truncate max-w-[120px]">{item.name}</span>
                                                            <div className="flex items-center gap-2">
                                                                <div className="w-12 h-1 bg-zinc-800 rounded-full overflow-hidden">
                                                                    <div
                                                                        className="h-full bg-primary"
                                                                        style={{ width: `${item.share}% ` }}
                                                                    />
                                                                </div>
                                                                <span className="text-zinc-400 font-bold w-7 text-right">{item.share}%</span>
                                                            </div>
                                                        </div>
                                                    ))}
                                                </div>
                                            )}
                                        </div>
                                    </motion.div>
                                ))}
                            </div>

                            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                                <div className="lg:col-span-2 bg-zinc-900/40 border border-zinc-900 rounded-[2.5rem] p-8 flex flex-col border-b-4 border-b-primary/20">
                                    <div className="flex justify-between items-center mb-10">
                                        <div>
                                            <h3 className="text-2xl font-bold tracking-tight">Spend Trend</h3>
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

                                    <div className="h-[350px] w-full relative">
                                        <ResponsiveContainer width="100%" height="100%">
                                            <AreaChart data={dynamicStats.spendHistory} margin={{ top: 20, right: 0, left: -20, bottom: 0 }}>
                                                <defs>
                                                    <linearGradient id="colorSpend" x1="0" y1="0" x2="1" y2="0">
                                                        <stop offset="0%" stopColor="#22d3ee" stopOpacity={1} />
                                                        <stop offset="100%" stopColor="#d946ef" stopOpacity={1} />
                                                    </linearGradient>
                                                    <linearGradient id="fillSpend" x1="0" y1="0" x2="0" y2="1">
                                                        <stop offset="0%" stopColor="#22d3ee" stopOpacity={0.2} />
                                                        <stop offset="100%" stopColor="#d946ef" stopOpacity={0} />
                                                    </linearGradient>
                                                </defs>
                                                <CartesianGrid strokeDasharray="3 3" stroke="#27272a" vertical={false} opacity={0.5} />
                                                <XAxis
                                                    dataKey="month"
                                                    stroke="#52525b"
                                                    tickLine={false}
                                                    axisLine={false}
                                                    tick={{ fill: '#a1a1aa', fontSize: 11, fontWeight: 600 }}
                                                    dy={10}
                                                />
                                                <YAxis
                                                    stroke="#52525b"
                                                    tickLine={false}
                                                    axisLine={false}
                                                    tick={{ fill: '#a1a1aa', fontSize: 10 }}
                                                    tickFormatter={(val) => `${(val / 1000000).toFixed(1)}M`}
                                                />
                                                <Tooltip
                                                    cursor={{ stroke: '#fff', strokeWidth: 1, strokeDasharray: '4 4' }}
                                                    content={({ active, payload, label }) => {
                                                        if (active && payload && payload.length) {
                                                            return (
                                                                <div className="bg-zinc-900/90 backdrop-blur-md border border-zinc-700/50 rounded-xl px-4 py-3 shadow-2xl">
                                                                    <p className="text-[10px] text-zinc-400 font-bold uppercase tracking-wider mb-1">{label}</p>
                                                                    <div className="flex items-center gap-2">
                                                                        <div className="w-2 h-2 rounded-full bg-cyan-400" />
                                                                        <span className="text-lg font-black text-white">
                                                                            {formatCurrency(payload[0].value as number)}
                                                                        </span>
                                                                    </div>
                                                                </div>
                                                            );
                                                        }
                                                        return null;
                                                    }}
                                                />
                                                <Area
                                                    type="monotone"
                                                    dataKey="spend"
                                                    stroke="url(#colorSpend)"
                                                    strokeWidth={4}
                                                    fillOpacity={1}
                                                    fill="url(#fillSpend)"
                                                    activeDot={{ r: 6, strokeWidth: 0, fill: '#fff' }}
                                                />
                                            </AreaChart>
                                        </ResponsiveContainer>
                                    </div>
                                </div>

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
                                                    onMouseEnter={(data) => setHoveredSpendType(data.name as any)}
                                                    onMouseLeave={() => setHoveredSpendType(null)}
                                                    className="cursor-pointer focus:outline-none"
                                                >
                                                    {dynamicStats.spendTypeData.map((entry, index) => (
                                                        <Cell
                                                            key={`cell - ${index} `}
                                                            fill={entry.color}
                                                            opacity={(hoveredSpendType && hoveredSpendType !== entry.name) || (activeSpendType && activeSpendType !== entry.name) ? 0.3 : 1}
                                                            className="transition-all duration-300"
                                                        />
                                                    ))}
                                                </Pie>
                                                <Tooltip
                                                    contentStyle={{ backgroundColor: '#09090b', border: '1px solid #18181b', borderRadius: '16px', boxShadow: '0 20px 25px -5px rgb(0 0 0 / 0.5)' }}
                                                    itemStyle={{ color: '#fff', fontSize: '12px', fontWeight: 'bold' }}
                                                    formatter={(value: any, name: any) => [`${value}% `, `${name} Cost`]}
                                                />
                                            </PieChart>
                                        </ResponsiveContainer>
                                        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                                            <span className="text-3xl font-black text-white">
                                                {activeSpendType ? dynamicStats.spendTypeData.find(s => s.name === activeSpendType)?.value : '100'}%
                                            </span>
                                            <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-[0.2em]">
                                                {hoveredSpendType || activeSpendType ? `${hoveredSpendType || activeSpendType} Cost` : 'Total Spend'}
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
                                                        <div className="h-2.5 w-2.5 rounded-full shrink-0 shadow-lg" style={{ backgroundColor: cat.color, boxShadow: `0 0 10px ${cat.color} 66` }} />
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
                            </div>


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
                                        onClick={() => alert('Unlock Full ROI Analysis & Detailed Documentation by connecting with our procurement team.')}
                                        className="bg-primary hover:bg-teal-600 text-white px-6 py-3 rounded-xl font-bold flex items-center gap-2 transition-all shadow-lg shadow-primary/20 active:scale-[0.98]"
                                    >
                                        <ShieldCheck className="h-4 w-4" />
                                        Request ROI Unlock
                                    </button>
                                </div>

                                <div className="grid grid-cols-1 md:grid-cols-3 gap-6 relative group/grid">
                                    <div className="absolute inset-0 z-10 flex items-center justify-center pointer-events-none group-hover/grid:hidden">
                                        <div className="bg-black/80 backdrop-blur-sm px-6 py-3 rounded-2xl border border-primary/30 flex items-center gap-3">
                                            <MoreHorizontal className="w-5 h-5 text-primary" />
                                            <span className="text-[10px] font-black uppercase tracking-widest text-primary">Strategic Analysis Locked</span>
                                        </div>
                                    </div>
                                    <div className="bg-primary/5 border border-primary/20 rounded-3xl p-8 border-b-4 border-b-primary blur-md pointer-events-none select-none">
                                        <span className="text-[10px] font-black text-primary uppercase tracking-widest mb-4 block">Total Potential ROI</span>
                                        <div className="text-4xl font-black text-white mb-2">{formatCurrency(dynamicStats.identifiedSavings)}</div>
                                        <p className="text-xs text-zinc-500">Based on variant consolidation & price variance analysis</p>
                                    </div>
                                    <div className="bg-emerald-500/5 border border-emerald-500/20 rounded-3xl p-8 border-b-4 border-b-emerald-500 blur-md pointer-events-none select-none">
                                        <span className="text-[10px] font-black text-emerald-500 uppercase tracking-widest mb-4 block">Quick-Win Savings</span>
                                        <div className="text-4xl font-black text-white mb-2">{formatCurrency(dynamicStats.identifiedSavings * 0.3)}</div>
                                        <p className="text-xs text-zinc-500">Immediate opportunities through duplicate vendor removal</p>
                                    </div>
                                    <div className="bg-amber-500/5 border border-amber-500/20 rounded-3xl p-8 border-b-4 border-b-amber-500 blur-md pointer-events-none select-none">
                                        <span className="text-[10px] font-black text-amber-500 uppercase tracking-widest mb-4 block">Strategic Pipeline</span>
                                        <div className="text-4xl font-black text-white mb-2">{formatCurrency(dynamicStats.identifiedSavings * 0.7)}</div>
                                        <p className="text-xs text-zinc-500">Medium-term savings via contract consolidation</p>
                                    </div>
                                </div>

                                <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 relative group/bottom">
                                    <div className="absolute inset-x-0 bottom-0 top-0 z-30 flex items-center justify-center p-12 text-center bg-black/40 backdrop-blur-md rounded-[2.5rem] border border-white/5 group-hover/bottom:backdrop-blur-0 transition-all duration-700">
                                        <div className="max-w-md">
                                            <div className="w-16 h-16 bg-primary/20 rounded-3xl flex items-center justify-center mx-auto mb-6">
                                                <Target className="h-8 w-8 text-primary" />
                                            </div>
                                            <h3 className="text-2xl font-black mb-3 text-white uppercase tracking-tighter italic">Deep Intelligence Gated</h3>
                                            <p className="text-sm text-zinc-400 font-medium mb-8">
                                                To prevent market signaling and protect your negotiation leverage, detailed category benchmarks and execution roadmaps are restricted to verified strategic partners.
                                            </p>
                                            <button
                                                onClick={() => alert('Requesting access to your personalized ROI roadmap...')}
                                                className="bg-white text-black px-8 py-4 rounded-2xl font-black text-xs uppercase tracking-widest shadow-2xl hover:bg-zinc-200 transition-all active:scale-95"
                                            >
                                                Unlock Strategy Roadmap
                                            </button>
                                        </div>
                                    </div>
                                    <div className="bg-zinc-900/40 border border-zinc-900 rounded-[2.5rem] p-8 blur-[1px] opacity-40 group-hover/bottom:blur-none group-hover/bottom:opacity-100 transition-all duration-1000 pointer-events-none select-none">
                                        <h3 className="text-xl font-bold mb-8 uppercase tracking-widest text-zinc-400">Strategic Levers</h3>
                                        <div className="space-y-6">
                                            {dynamicStats.savingsLevers.slice(0, 5).map((lever) => (
                                                <div key={lever.name} className="space-y-3">
                                                    <div className="flex justify-between text-[10px] font-black uppercase tracking-widest">
                                                        <span className="text-zinc-500">{lever.name}</span>
                                                        <span className="text-primary">{lever.probability}% Yield</span>
                                                    </div>
                                                    <div className="h-1.5 bg-zinc-950 rounded-full overflow-hidden">
                                                        <div className="h-full bg-primary/40 rounded-full" style={{ width: `${lever.probability}%`, backgroundColor: lever.color }} />
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    </div>

                                    <div className="bg-zinc-900/40 border border-zinc-900 rounded-[2.5rem] p-8 blur-3xl saturate-0 opacity-20 pointer-events-none select-none transition-all duration-1000 group-hover/bottom:blur-xl">
                                        <h3 className="text-xl font-bold">Execution Roadmap</h3>
                                    </div>
                                </div>

                            </motion.div>
                        )
                    }

                    {/* Categorization Tab */}
                    {activeTab === 'categorization' && (
                        <motion.div
                            key="categorization"
                            initial={{ opacity: 0, scale: 0.95 }}
                            animate={{ opacity: 1, scale: 1 }}
                            exit={{ opacity: 0, scale: 0.95 }}
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
                                            {hoveredSpendType || activeSpendType ? `${hoveredSpendType || activeSpendType} Cost` : 'Total Analyzed'}
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
                {/* Transaction Drilldowns (Default) */}
                {
                    drilldownKpi && !['sourcing', 'suppliers', 'vendors'].includes(drilldownKpi.id) && !drilldownKpi.isSummary && (
                        <TransactionDrilldown
                            isOpen={true}
                            onClose={() => setDrilldownKpi(null)}
                            data={drilldownKpi.data || data}
                            mappings={mappings}
                            title={`${drilldownKpi.label} (${(drilldownKpi.data || data).length} Records)`}
                            icon={drilldownKpi.icon}
                            color={drilldownKpi.color}
                            kpiId={drilldownKpi.id}
                        />
                    )
                }

                {/* Supplier Summary Drilldown */}
                {
                    drilldownKpi && (drilldownKpi.id === 'suppliers' || drilldownKpi.id === 'vendors') && (
                        <SupplierSummaryDrilldown
                            isOpen={true}
                            onClose={() => setDrilldownKpi(null)}
                            data={drilldownKpi.data}
                            totalSpend={drilldownKpi.totalSpend}
                            title={drilldownKpi.label}
                            mappings={mappings}
                            color={drilldownKpi.color}
                        />
                    )
                }

                {/* Summary Drilldown (BU, Location) */}
                {
                    drilldownKpi && drilldownKpi.isSummary && (
                        <SummaryDrilldown
                            isOpen={true}
                            onClose={() => setDrilldownKpi(null)}
                            data={drilldownKpi.data}
                            title={drilldownKpi.label}
                            label={drilldownKpi.label.replace('Spend by ', '')}
                            color={drilldownKpi.color === 'rose' ? 'rose' : 'primary'}
                        />
                    )
                }

                {/* Sourcing Strategy Drilldown */}
                {
                    drilldownKpi && drilldownKpi.id === 'sourcing' && (
                        <SourcingDrilldown
                            isOpen={true}
                            onClose={() => setDrilldownKpi(null)}
                            data={drilldownKpi.data}
                            title="Sourcing Strategy Analysis"
                        />
                    )
                }
            </motion.div >
            {/* Supplier Drilldown Modal */}
            <SupplierListModal
                isOpen={isSupplierModalOpen}
                onClose={() => setIsSupplierModalOpen(false)}
                data={supplierModalData}
                totalSpend={dynamicStats.totalSpend}
                currency={currency}
            />

            {/* Upgrade Modal */}
            <UpgradeModal
                isOpen={isUpgradeModalOpen}
                onClose={() => setIsUpgradeModalOpen(false)}
                title={upgradeModalProps.title}
                description={upgradeModalProps.description}
            />

            {/* Team Management Modal */}
            <TeamManagement
                isOpen={isTeamModalOpen}
                onClose={() => setIsTeamModalOpen(false)}
                projectName={currentProject?.name || "Procurement Analysis"}
            />
        </>
    );
};

export default AnalyticsDashboard;
