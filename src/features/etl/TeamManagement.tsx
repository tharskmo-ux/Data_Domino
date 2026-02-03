import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Mail, Shield, UserPlus, Trash2, Check, ExternalLink, Users } from 'lucide-react';
import { cn } from '../../lib/utils';

interface TeamMember {
    id: string;
    email: string;
    role: 'Viewer' | 'Editor' | 'Admin';
    status: 'active' | 'pending';
}

interface TeamManagementProps {
    isOpen: boolean;
    onClose: () => void;
    projectName: string;
}

const TeamManagement: React.FC<TeamManagementProps> = ({ isOpen, onClose, projectName }) => {
    const [inviteEmail, setInviteEmail] = useState('');
    const [inviteRole, setInviteRole] = useState<'Viewer' | 'Editor' | 'Admin'>('Viewer');
    const [isInviteSending, setIsInviteSending] = useState(false);
    const [isCopied, setIsCopied] = useState(false);
    const [members, setMembers] = useState<TeamMember[]>([
        { id: '1', email: 'admin@datadomino.ai', role: 'Admin', status: 'active' },
        { id: '2', email: 'procurement.lead@client.com', role: 'Editor', status: 'active' },
        { id: '3', email: 'analyst@client.com', role: 'Viewer', status: 'pending' },
    ]);

    const handleInvite = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!inviteEmail) return;

        setIsInviteSending(true);
        // Simulate network delay
        await new Promise(resolve => setTimeout(resolve, 1500));

        const newMember: TeamMember = {
            id: Math.random().toString(36).substr(2, 5),
            email: inviteEmail,
            role: inviteRole,
            status: 'pending'
        };

        setMembers([newMember, ...members]);
        setInviteEmail('');
        setIsInviteSending(false);
        // alert(`Invitation sent to ${inviteEmail}`);
    };

    const removeMember = (id: string) => {
        setMembers(members.filter(m => m.id !== id));
    };

    const handleCopyLink = () => {
        // Generate a working local link for demonstration
        const shareToken = Math.random().toString(36).substr(2, 9);
        const demoLink = `${window.location.protocol}//${window.location.host}?project=${encodeURIComponent(projectName)}&share=${shareToken}`;

        navigator.clipboard.writeText(demoLink).then(() => {
            setIsCopied(true);
            setTimeout(() => setIsCopied(false), 2000);
        });
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 md:p-10">
            <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={onClose}
                className="absolute inset-0 bg-black/90 backdrop-blur-md"
            />

            <motion.div
                initial={{ opacity: 0, scale: 0.95, y: 20 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95, y: 20 }}
                className="relative w-full max-w-2xl h-auto max-h-[80vh] flex flex-col bg-zinc-950 border border-zinc-800 rounded-[2.5rem] overflow-hidden shadow-[0_0_50px_rgba(0,0,0,0.5)]"
            >
                <div className="p-8 border-b border-zinc-900 flex justify-between items-center bg-zinc-900/20 shrink-0">
                    <div>
                        <h3 className="text-2xl font-bold flex items-center gap-3 text-white">
                            <Shield className="h-6 w-6 text-primary" />
                            Access Management
                        </h3>
                        <p className="text-zinc-500 text-xs mt-1 font-medium tracking-tight">Manage collaborators for <span className="text-primary font-bold">{projectName}</span></p>
                    </div>
                    <button
                        onClick={onClose}
                        className="p-2.5 bg-zinc-900 hover:bg-zinc-800 rounded-2xl text-zinc-500 hover:text-white transition-all border border-zinc-800"
                    >
                        <X className="h-6 w-6" />
                    </button>
                </div>

                <div className="flex-1 overflow-y-auto p-8 space-y-10 custom-scrollbar">
                    {/* Invite Section */}
                    <form onSubmit={handleInvite} className="space-y-6">
                        <div className="text-[10px] font-black uppercase tracking-[0.25em] text-zinc-500 flex items-center gap-2">
                            <UserPlus className="h-3 w-3" /> Invite New Collaborator
                        </div>
                        <div className="flex flex-col sm:flex-row gap-3">
                            <div className="relative flex-1">
                                <Mail className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-500" />
                                <input
                                    type="email"
                                    placeholder="colleague@example.com"
                                    value={inviteEmail}
                                    onChange={(e) => setInviteEmail(e.target.value)}
                                    className="w-full bg-zinc-950 border border-zinc-800 rounded-2xl py-3.5 pl-11 pr-4 text-sm text-white focus:outline-none focus:ring-2 focus:ring-primary/40 transition-all placeholder:text-zinc-700"
                                />
                            </div>
                            <select
                                value={inviteRole}
                                onChange={(e) => setInviteRole(e.target.value as any)}
                                className="bg-zinc-950 border border-zinc-800 rounded-2xl px-5 py-3.5 text-sm font-bold text-zinc-400 focus:outline-none focus:ring-2 focus:ring-primary/40 appearance-none"
                            >
                                <option value="Viewer">Viewer</option>
                                <option value="Editor">Editor</option>
                                <option value="Admin">Admin</option>
                            </select>
                            <button
                                type="submit"
                                disabled={isInviteSending || !inviteEmail}
                                className={cn(
                                    "px-8 py-3.5 rounded-2xl font-black text-xs uppercase tracking-widest flex items-center justify-center gap-2 transition-all shadow-xl shadow-primary/20 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed",
                                    isInviteSending ? "bg-zinc-800 text-zinc-400" : "bg-primary hover:bg-teal-400 text-black"
                                )}
                            >
                                {isInviteSending ? 'Sending...' : 'Send Invite'}
                            </button>
                        </div>
                    </form>

                    {/* Members List */}
                    <div className="space-y-6">
                        <div className="text-[10px] font-black uppercase tracking-[0.25em] text-zinc-500 flex items-center gap-2">
                            <Users className="h-3 w-3" /> Active Collaborators
                        </div>
                        <div className="divide-y divide-zinc-900 border border-zinc-900 rounded-[2rem] overflow-hidden bg-zinc-900/10">
                            {members.map((member) => (
                                <div key={member.id} className="p-5 flex items-center justify-between group hover:bg-zinc-900/30 transition-colors">
                                    <div className="flex items-center gap-4">
                                        <div className="w-11 h-11 rounded-2xl bg-zinc-950 border border-zinc-800 flex items-center justify-center font-bold text-zinc-600 shadow-inner group-hover:border-primary/30 transition-colors">
                                            {member.email[0].toUpperCase()}
                                        </div>
                                        <div>
                                            <div className="text-sm font-bold text-white flex items-center gap-2">
                                                {member.email}
                                                {member.status === 'pending' && (
                                                    <span className="px-2 py-0.5 bg-amber-500/10 text-amber-500 text-[8px] font-black uppercase rounded-lg border border-amber-500/20">Pending</span>
                                                )}
                                            </div>
                                            <div className="text-[10px] text-zinc-600 font-bold uppercase tracking-widest mt-0.5">Joined {new Date().toLocaleDateString()}</div>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-4">
                                        <span className={cn(
                                            "px-3 py-1.5 rounded-xl text-[9px] font-black uppercase tracking-widest border",
                                            member.role === 'Admin' ? "bg-rose-500/10 text-rose-500 border-rose-500/20" :
                                                member.role === 'Editor' ? "bg-primary/10 text-primary border-primary/20" :
                                                    "bg-zinc-800/50 text-zinc-500 border-zinc-700/50"
                                        )}>
                                            {member.role}
                                        </span>
                                        {member.email !== 'admin@datadomino.ai' && (
                                            <button
                                                onClick={() => removeMember(member.id)}
                                                className="p-2.5 bg-zinc-900/50 hover:bg-rose-500/10 rounded-xl text-zinc-700 hover:text-rose-500 transition-all border border-zinc-800/50"
                                            >
                                                <Trash2 className="h-4 w-4" />
                                            </button>
                                        )}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>

                <div className="p-6 bg-zinc-950 border-t border-zinc-900 flex justify-between items-center shrink-0">
                    <div className="flex items-center gap-2 text-[10px] font-black text-zinc-600 uppercase tracking-widest">
                        <Check className="h-3 w-3 text-emerald-500" /> Secure Protocol Active
                    </div>
                    <button
                        onClick={handleCopyLink}
                        className="text-zinc-500 hover:text-white text-[10px] font-black uppercase tracking-widest flex items-center gap-2 transition-all group"
                    >
                        {isCopied ? (
                            <span className="text-primary flex items-center gap-2">
                                Link Copied <Check className="h-3.5 w-3.5" />
                            </span>
                        ) : (
                            <>
                                Copy Public Link <ExternalLink className="h-3.5 w-3.5 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform" />
                            </>
                        )}
                    </button>
                </div>
            </motion.div>
        </div>
    );
};

export default TeamManagement;
