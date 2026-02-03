import React from 'react';
import { motion } from 'framer-motion';
import {
    Clock,
    Download,
    CheckCircle2,
    Layers,
    UserCircle2,
    Tag,
    Upload,
    Calendar,
    ChevronRight,
    Search
} from 'lucide-react';
import { cn } from '../../lib/utils';

interface Activity {
    id: string;
    type: 'export' | 'mapping' | 'matching' | 'categorization' | 'upload';
    label: string;
    timestamp: string;
    details?: string;
    metadata?: any;
}

interface ActivityHistoryProps {
    activities: Activity[];
}

const ActivityHistory: React.FC<ActivityHistoryProps> = ({ activities }) => {
    const getActivityIcon = (type: Activity['type']) => {
        switch (type) {
            case 'export': return <Download className="h-4 w-4" />;
            case 'mapping': return <Layers className="h-4 w-4" />;
            case 'matching': return <UserCircle2 className="h-4 w-4" />;
            case 'categorization': return <Tag className="h-4 w-4" />;
            case 'upload': return <Upload className="h-4 w-4" />;
            default: return <Clock className="h-4 w-4" />;
        }
    };

    const getActivityColor = (type: Activity['type']) => {
        switch (type) {
            case 'export': return 'text-blue-500 bg-blue-500/10 border-blue-500/20';
            case 'mapping': return 'text-purple-500 bg-purple-500/10 border-purple-500/20';
            case 'matching': return 'text-amber-500 bg-amber-500/10 border-amber-500/20';
            case 'categorization': return 'text-rose-500 bg-rose-500/10 border-rose-500/20';
            case 'upload': return 'text-emerald-500 bg-emerald-500/10 border-emerald-500/20';
            default: return 'text-zinc-500 bg-zinc-500/10 border-zinc-500/20';
        }
    };

    return (
        <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="flex justify-between items-end">
                <div>
                    <h2 className="text-3xl font-bold tracking-tight mb-2">Activity Audit Trail</h2>
                    <p className="text-zinc-500">A comprehensive history of all processing milestones and exports for this project.</p>
                </div>
                <div className="flex items-center gap-3 bg-zinc-900/50 p-2 rounded-2xl border border-zinc-900 border-zinc-800">
                    <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-600" />
                        <input
                            type="text"
                            placeholder="Search activity..."
                            className="bg-transparent text-sm border-none focus:ring-0 pl-10 w-48"
                        />
                    </div>
                </div>
            </div>

            <div className="grid grid-cols-1 gap-4">
                {activities.length === 0 ? (
                    <div className="p-20 text-center bg-zinc-900/30 border border-zinc-900 rounded-[2.5rem] flex flex-col items-center">
                        <Clock className="h-12 w-12 text-zinc-800 mb-4" />
                        <h3 className="text-lg font-bold text-zinc-400">No activity logged yet</h3>
                        <p className="text-sm text-zinc-600 max-w-xs mt-2">Start processing your data to see the audit trail here.</p>
                    </div>
                ) : (
                    activities.map((activity, idx) => (
                        <motion.div
                            initial={{ opacity: 0, x: -20 }}
                            animate={{ opacity: 1, x: 0 }}
                            transition={{ delay: idx * 0.05 }}
                            key={activity.id}
                            className="p-6 bg-zinc-900/40 border border-zinc-900 hover:border-zinc-800 transition-all rounded-3xl flex items-center gap-6 group"
                        >
                            <div className={cn(
                                "h-12 w-12 rounded-2xl border flex items-center justify-center shrink-0 transition-transform group-hover:scale-110",
                                getActivityColor(activity.type)
                            )}>
                                {getActivityIcon(activity.type)}
                            </div>

                            <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 mb-1">
                                    <span className="text-lg font-bold text-white group-hover:text-primary transition-colors truncate">
                                        {activity.label}
                                    </span>
                                    <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                                </div>
                                <div className="flex items-center gap-4 text-xs font-bold uppercase tracking-widest text-zinc-500">
                                    <span className="flex items-center gap-1.5">
                                        <Calendar className="h-3 w-3" />
                                        {new Date(activity.timestamp).toLocaleDateString()}
                                    </span>
                                    <span className="flex items-center gap-1.5 font-mono text-zinc-600">
                                        <Clock className="h-3 w-3" />
                                        {new Date(activity.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                    </span>
                                    {activity.details && (
                                        <span className="hidden md:inline text-zinc-700 italic">
                                            {activity.details}
                                        </span>
                                    )}
                                </div>
                            </div>

                            <div className="flex items-center gap-4">
                                {activity.type === 'export' && (
                                    <button className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-white rounded-xl text-xs font-bold transition-all flex items-center gap-2 border border-zinc-700">
                                        <Download className="h-3.5 w-3.5" /> Re-download
                                    </button>
                                )}
                                <div className="p-2 text-zinc-700 group-hover:text-primary transition-colors opacity-0 group-hover:opacity-100">
                                    <ChevronRight className="h-5 w-5" />
                                </div>
                            </div>
                        </motion.div>
                    ))
                )}
            </div>
        </div>
    );
};

export default ActivityHistory;
