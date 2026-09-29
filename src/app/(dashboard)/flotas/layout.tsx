import { PrimasProvider } from '@/core/flotas/primasContext';

export default function FlotasLayout({ children }: { children: React.ReactNode }) {
    return <PrimasProvider>{children}</PrimasProvider>;
}
