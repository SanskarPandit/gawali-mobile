import { PageHeader } from '@/components/ui';
import { WalletAutopayView } from './WalletAutopayView';

export default function WalletPage() {
  return (
    <>
      <PageHeader title="Wallet & billing" sub="Every delivery, refund and bottle credit, in one transparent ledger." />
      <WalletAutopayView />
    </>
  );
}
