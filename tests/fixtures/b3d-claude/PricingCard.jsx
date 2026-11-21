import Button from './Button.jsx';
import './PricingCard.css';

export default function PricingCard({
  plan = 'Team plan',
  price = '$12 / person',
  description = 'Run payroll in 90 countries with local taxes and compliance handled for you.',
  cta = 'Start now',
  href = '#',
}) {
  return (
    <div className="pricing-card">
      <div className="pricing-card-heading">
        <p className="pricing-card-plan">{plan}</p>
        <p className="pricing-card-price">{price}</p>
      </div>
      <p className="pricing-card-description">{description}</p>
      <Button href={href} variant="primary">{cta}</Button>
    </div>
  );
}
