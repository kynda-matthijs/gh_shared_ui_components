import {
    Home, Utensils, Wallet, Users, HeartPulse, FileText, ShieldAlert,
    Briefcase, HelpCircle, Phone, MapPin, Clock, MessageCircle, Heart,
} from 'lucide-react';

// Curated icon set for CMS-configured chat conversation-starters — same
// name-string-in-config → named-import-map pattern already used for block-type
// icons in admin_client's registry.js/BlockPicker.jsx (BLOCK_ICONS), so this list
// must stay in sync with whatever options AiChatBlockEditor.jsx's starter row
// picker offers (admin_client/src/components/block-editor/starterIconNames.js).
export const STARTER_ICONS = {
    Home, Utensils, Wallet, Users, HeartPulse, FileText, ShieldAlert,
    Briefcase, HelpCircle, Phone, MapPin, Clock, MessageCircle, Heart,
};
