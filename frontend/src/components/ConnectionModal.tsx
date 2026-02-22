import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, CheckCircle2, ArrowRight, Mail, Settings, Zap } from 'lucide-react';

interface ConnectionModalProps {
  isOpen: boolean;
  onClose: () => void;
  magicLink: string;
}

const ConnectionModal = ({ isOpen, onClose, magicLink }: ConnectionModalProps) => {
  const steps = [
    {
      title: "Open Email Settings",
      desc: "Go to your Gmail or Outlook 'Filters & Forwarding' section.",
      icon: <Settings className="w-5 h-5" />,
    },
    {
      title: "Create a Filter",
      desc: "Set a rule for emails coming from your website contact form.",
      icon: <Mail className="w-5 h-5" />,
    },
    {
      title: "Paste Magic Link",
      desc: "Choose 'Forward to' and paste your LeadRanker address.",
      icon: <Zap className="w-5 h-5" />,
    },
  ];

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="absolute inset-0 bg-gray-900/60 backdrop-blur-sm"
          />

          {/* Modal Content */}
          <motion.div
            initial={{ scale: 0.9, opacity: 0, y: 20 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.9, opacity: 0, y: 20 }}
            className="relative bg-white rounded-3xl shadow-2xl max-w-lg w-full overflow-hidden"
          >
            {/* Header */}
            <div className="bg-blue-600 p-6 text-white relative">
              <button 
                onClick={onClose}
                className="absolute top-4 right-4 p-1 hover:bg-white/20 rounded-full transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
              <h2 className="text-2xl font-bold flex items-center gap-2">
                Setup the Magic <Zap className="w-5 h-5 fill-current text-yellow-300" />
              </h2>
              <p className="text-blue-100 text-sm mt-1">
                Zero code. Just simple email forwarding.
              </p>
            </div>

            <div className="p-8 space-y-8">
              {/* The "Why it works" logic */}
              <div className="bg-blue-50 p-4 rounded-xl border border-blue-100">
                <p className="text-sm text-blue-800 leading-relaxed">
                  <strong>The Logic:</strong> Your custom website sends you an email alert. 
                  We just tell your inbox to <strong>automatically</strong> send a copy to us. 
                  No developers needed.
                </p>
              </div>

              {/* Steps Animation */}
              <div className="space-y-6">
                {steps.map((step, index) => (
                  <motion.div 
                    key={index}
                    initial={{ x: -20, opacity: 0 }}
                    animate={{ x: 0, opacity: 1 }}
                    transition={{ delay: index * 0.1 }}
                    className="flex gap-4"
                  >
                    <div className="flex-shrink-0 w-10 h-10 bg-gray-100 rounded-full flex items-center justify-center text-blue-600 font-bold">
                      {step.icon}
                    </div>
                    <div>
                      <h4 className="font-bold text-gray-900 flex items-center gap-2">
                        Step {index + 1}: {step.title}
                        {index < 2 && <ArrowRight className="w-3 h-3 text-gray-400" />}
                      </h4>
                      <p className="text-sm text-gray-500">{step.desc}</p>
                    </div>
                  </motion.div>
                ))}
              </div>

              {/* Final Action */}
              <div className="pt-4 space-y-3">
                <div className="text-xs font-bold text-gray-400 uppercase tracking-widest text-center">
                  Your Unique Forwarding Address
                </div>
                <div className="p-3 bg-gray-100 rounded-xl border-2 border-dashed border-gray-300 text-center select-all cursor-pointer hover:border-blue-400 transition-colors group">
                  <code className="text-blue-700 font-mono text-sm">{magicLink}</code>
                </div>
                <button 
                  onClick={onClose}
                  className="w-full bg-blue-600 text-white py-4 rounded-2xl font-bold flex items-center justify-center gap-2 hover:bg-blue-700 shadow-lg shadow-blue-200 transition-all active:scale-95"
                >
                  <CheckCircle2 className="w-5 h-5" />
                  I've Set This Up
                </button>
              </div>
            </div>

            {/* Footer Note */}
            <div className="p-4 bg-gray-50 border-t border-gray-100 text-center">
              <p className="text-[11px] text-gray-400 uppercase font-medium">
                Works with Gmail, Outlook, Zoho, & Private Servers
              </p>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};

export default ConnectionModal;