import { PageHeader } from '@/components/ui';
import { BottleReturnLedger } from './BottleReturnLedger';

export default function BottlesPage() {
  return (
    <>
      <PageHeader title="Bottles & recycling" sub="Your circular packaging ledger." />
      <BottleReturnLedger />
    </>
  );
}
