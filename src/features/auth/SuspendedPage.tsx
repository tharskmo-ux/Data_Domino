import React from 'react';
import { Mail, Calendar, AlertCircle } from 'lucide-react';
import { ENALSYS_EMAIL, ENALSYS_BOOKING_URL } from '../../lib/constants';

const SuspendedPage: React.FC = () => {
    return (
        <div className="min-h-screen bg-zinc-950 flex flex-col items-center justify-center p-6 text-white text-center">
            <div className="max-w-md w-full animate-in fade-in slide-in-from-bottom-4 duration-700">
                <div className="w-20 h-20 bg-red-500/10 rounded-full flex items-center justify-center border border-red-500/20 mx-auto mb-8">
                    <AlertCircle className="w-10 h-10 text-red-500" />
                </div>

                <h1 className="text-4xl font-black mb-4 tracking-tighter">Account Suspended</h1>
                <p className="text-zinc-400 text-lg mb-10 font-medium">
                    Your access to Data Domino has been suspended.
                </p>

                <div className="flex flex-col gap-4">
                    <a
                        href={`mailto:${ENALSYS_EMAIL}`}
                        className="w-full h-14 bg-zinc-100 hover:bg-white text-zinc-900 flex items-center justify-center gap-3 font-black rounded-2xl transition-all shadow-xl shadow-white/5 uppercase tracking-widest text-xs"
                    >
                        <Mail className="w-5 h-5" />
                        Email Us
                    </a>

                    <a
                        href={ENALSYS_BOOKING_URL}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="w-full h-14 bg-zinc-900 border border-zinc-800 hover:bg-zinc-800 text-white flex items-center justify-center gap-3 font-black rounded-2xl transition-all uppercase tracking-widest text-xs"
                    >
                        <Calendar className="w-5 h-5" />
                        Book a Call
                    </a>
                </div>

                <div className="mt-12 pt-8 border-t border-zinc-900">
                    <p className="text-zinc-500 text-sm font-medium leading-relaxed">
                        If you believe this is a mistake, please reach out. <br />
                        We will respond within 24 hours.
                    </p>
                </div>

                <div className="mt-16 text-zinc-700 font-bold text-[10px] uppercase tracking-[0.2em] pointer-events-none">
                    &copy; {new Date().getFullYear()} ENALSYS PRIVATE LIMITED
                </div>
            </div>
        </div>
    );
};

export default SuspendedPage;
