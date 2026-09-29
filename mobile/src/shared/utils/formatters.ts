export const formatCurrency = (amount: number | string): string => {
  const num = typeof amount === 'string' ? parseFloat(amount) : amount;
  if (isNaN(num)) return '₹0.00';
  return `₹${num.toLocaleString('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
};

export const formatQuantity = (qty: number | string, unit: string = 'L'): string => {
  const num = typeof qty === 'string' ? parseFloat(qty) : qty;
  if (isNaN(num)) return `0 ${unit}`;
  return `${Number(num.toFixed(2))} ${unit}`;
};

export const formatLitres = (qty: number | string): string => {
  return formatQuantity(qty, 'L');
};

export const formatShortDate = (dateStr: string): string => {
  try {
    const d = new Date(dateStr);
    return d.toLocaleDateString('en-IN', {
      day: 'numeric',
      month: 'short',
    });
  } catch {
    return dateStr;
  }
};
