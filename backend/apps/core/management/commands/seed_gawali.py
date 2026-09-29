from django.core.management.base import BaseCommand
from django.utils import timezone
from datetime import date, timedelta, time
import decimal

from apps.accounts.models import User
from apps.dairies.models import Dairy, DeliveryRoute
from apps.customers.models import CustomerProfile
from apps.products.models import Product
from apps.subscriptions.models import Subscription, DeliveryOverride, VacationPeriod, Order
from apps.deliveries.models import DeliveryBoy, DailyDelivery
from apps.billing.models import Bill, BillItem
from apps.billing.tasks import generate_bill_for_customer_month
from apps.payments.models import Payment
from apps.complaints.models import Complaint
from apps.notifications.models import Notification

class Command(BaseCommand):
    help = 'Seeds initial demo accounts, Badhale Dairy, products, subscriptions, deliveries, and bills for Gawali.'

    def handle(self, *args, **options):
        self.stdout.write(self.style.NOTICE('Starting Gawali Enterprise DB Seeding...'))

        today = timezone.localdate()

        # -------------------------------------------------------------
        # 1. DEMO ACCOUNTS
        # -------------------------------------------------------------
        self.stdout.write('Creating platform accounts...')

        # Admin: mahesh.garade@gawali.app / Admin@12345
        admin_user, _ = User.objects.update_or_create(
            email='mahesh.garade@gawali.app',
            defaults={
                'full_name': 'Mahesh Garade',
                'phone': '+919988776655',
                'role': User.Role.ADMIN,
                'is_staff': True,
                'is_superuser': True,
                'is_active': True,
                'is_email_verified': True,
                'is_phone_verified': True,
            }
        )
        admin_user.set_password('Admin@12345')
        admin_user.save()

        # Dairy Owner: shailesh.badhale@gawali.app / Gawali@12345 (Badhale Dairy)
        dairy_user, _ = User.objects.update_or_create(
            email='shailesh.badhale@gawali.app',
            defaults={
                'full_name': 'Shailesh Badhale',
                'phone': '+919822012345',
                'role': User.Role.DAIRY,
                'is_active': True,
                'is_email_verified': True,
                'is_phone_verified': True,
            }
        )
        dairy_user.set_password('Gawali@12345')
        dairy_user.save()

        badhale_dairy, _ = Dairy.objects.update_or_create(
            user=dairy_user,
            defaults={
                'business_name': 'Badhale Dairy',
                'phone': '+919822012345',
                'address': 'Plot 42, Dairy Chowk, Near Garware College, Karve Road',
                'city': 'Pune',
                'state': 'Maharashtra',
                'pincode': '411004',
                'cutoff_time': time(22, 0, 0),
                'billing_cycle': Dairy.BillingCycle.MONTHLY,
                'is_verified': True,
                'is_active': True,
                'bank_upi_id': 'badhaledairy@okaxis'
            }
        )

        # Delivery Boy: suresh.kadam@gawali.app / Delivery@12345
        delivery_user, _ = User.objects.update_or_create(
            email='suresh.kadam@gawali.app',
            defaults={
                'full_name': 'Suresh Kadam',
                'phone': '+919850123456',
                'role': User.Role.DELIVERY_BOY,
                'is_active': True,
                'is_email_verified': True,
                'is_phone_verified': True,
            }
        )
        delivery_user.set_password('Delivery@12345')
        delivery_user.save()

        # Delivery Routes
        route1, _ = DeliveryRoute.objects.update_or_create(
            dairy=badhale_dairy,
            name='Route 1 - Shivaji Nagar & Model Colony',
            defaults={'sort_order': 1, 'description': 'Morning delivery loop for Shivaji Nagar'}
        )
        route2, _ = DeliveryRoute.objects.update_or_create(
            dairy=badhale_dairy,
            name='Route 2 - Kothrud & Karve Road',
            defaults={'sort_order': 2, 'description': 'Morning delivery loop for Kothrud'}
        )

        delivery_boy, _ = DeliveryBoy.objects.update_or_create(
            user=delivery_user,
            defaults={
                'dairy': badhale_dairy,
                'vehicle_number': 'MH 12 AB 3421',
                'assigned_route': route1,
                'is_active': True
            }
        )

        # Customer: rahul.patil@example.com / Customer@12345
        customer_user, _ = User.objects.update_or_create(
            email='rahul.patil@example.com',
            defaults={
                'full_name': 'Rahul Patil',
                'phone': '+919876543210',
                'role': User.Role.CUSTOMER,
                'is_active': True,
                'is_email_verified': True,
                'is_phone_verified': True,
            }
        )
        customer_user.set_password('Customer@12345')
        customer_user.save()

        customer_profile, _ = CustomerProfile.objects.update_or_create(
            user=customer_user,
            defaults={
                'dairy': badhale_dairy,
                'delivery_route': route1,
                'address': 'Flat 402, Green Acres, Off Senapati Bapat Road, Shivaji Nagar',
                'flat_or_house_number': 'Flat 402, Building A',
                'landmark': 'Opposite Symbiosis College',
                'latitude': decimal.Decimal('18.5314000'),
                'longitude': decimal.Decimal('73.8446000'),
                'delivery_instructions': 'Leave milk bag at the wooden hook beside the nameplate. Ring bell once.',
                'preferred_language': CustomerProfile.Language.ENGLISH,
                'route_stop_order': 1,
                'is_active': True
            }
        )

        # Additional Sample Customers for Realistic Dairy Operations & Overdue Reminders
        cust2_user, _ = User.objects.update_or_create(
            email='priya.sharma@example.com',
            defaults={'full_name': 'Priya Sharma', 'phone': '+918765432109', 'role': User.Role.CUSTOMER}
        )
        cust2_user.set_password('Customer@12345')
        cust2_user.save()
        cust2_profile, _ = CustomerProfile.objects.update_or_create(
            user=cust2_user,
            defaults={
                'dairy': badhale_dairy,
                'delivery_route': route1,
                'address': 'Plot 15, Sector 3, Model Colony, Pune',
                'latitude': decimal.Decimal('18.5340000'),
                'longitude': decimal.Decimal('73.8390000'),
                'delivery_instructions': 'Keep in milk box outside gate',
                'route_stop_order': 2,
            }
        )

        cust3_user, _ = User.objects.update_or_create(
            email='vikram.kulkarni@example.com',
            defaults={'full_name': 'Vikram Kulkarni', 'phone': '+917654321098', 'role': User.Role.CUSTOMER}
        )
        cust3_user.set_password('Customer@12345')
        cust3_user.save()
        cust3_profile, _ = CustomerProfile.objects.update_or_create(
            user=cust3_user,
            defaults={
                'dairy': badhale_dairy,
                'delivery_route': route2,
                'address': 'Flat 304, D-Bldg, Dahanukar Colony, Kothrud, Pune',
                'route_stop_order': 1,
            }
        )

        # -------------------------------------------------------------
        # 2. PRODUCTS (DAIRY CATALOGUE)
        # -------------------------------------------------------------
        self.stdout.write('Creating products catalogue...')

        cow_milk, _ = Product.objects.update_or_create(
            dairy=badhale_dairy,
            name='Gir Cow Milk (A2)',
            defaults={
                'unit': 'L',
                'price_per_unit': decimal.Decimal('68.00'),
                'kind': Product.Kind.SUBSCRIPTION,
                'description': 'Pure organic A2 Gir Cow milk, fresh and non-homogenized.',
                'is_available': True
            }
        )

        buffalo_milk, _ = Product.objects.update_or_create(
            dairy=badhale_dairy,
            name='Buffalo Milk (Full Cream)',
            defaults={
                'unit': 'L',
                'price_per_unit': decimal.Decimal('78.00'),
                'kind': Product.Kind.SUBSCRIPTION,
                'description': 'Rich 7.5% fat creamy buffalo milk, ideal for tea, coffee, and homemade curd.',
                'is_available': True
            }
        )

        curd, _ = Product.objects.update_or_create(
            dairy=badhale_dairy,
            name='Farm Fresh Curd (Dahi)',
            defaults={
                'unit': '500g',
                'price_per_unit': decimal.Decimal('45.00'),
                'kind': Product.Kind.ONE_TIME,
                'description': 'Thick natural set curd made from fresh milk.',
                'is_available': True
            }
        )

        paneer, _ = Product.objects.update_or_create(
            dairy=badhale_dairy,
            name='Fresh Malai Paneer',
            defaults={
                'unit': '250g',
                'price_per_unit': decimal.Decimal('120.00'),
                'kind': Product.Kind.ONE_TIME,
                'description': 'Super soft melt-in-mouth artisanal cottage cheese.',
                'is_available': True
            }
        )

        ghee, _ = Product.objects.update_or_create(
            dairy=badhale_dairy,
            name='Desi Cow Bilona Ghee',
            defaults={
                'unit': '500ml',
                'price_per_unit': decimal.Decimal('950.00'),
                'kind': Product.Kind.ONE_TIME,
                'description': 'Traditional Vedic bilona method cultured cow ghee.',
                'is_available': True
            }
        )

        # -------------------------------------------------------------
        # 3. SUBSCRIPTIONS
        # -------------------------------------------------------------
        self.stdout.write('Setting up subscriptions and calendar overrides...')

        sub_start = today.replace(day=1) - timedelta(days=60) # Active for 2 months
        sub_rahul, _ = Subscription.objects.update_or_create(
            customer=customer_profile,
            defaults={
                'product': buffalo_milk,
                'default_quantity': decimal.Decimal('1.50'),
                'delivery_time_slot': Subscription.TimeSlot.MORNING,
                'status': Subscription.Status.ACTIVE,
                'start_date': sub_start
            }
        )

        sub_priya, _ = Subscription.objects.update_or_create(
            customer=cust2_profile,
            defaults={
                'product': cow_milk,
                'default_quantity': decimal.Decimal('1.00'),
                'delivery_time_slot': Subscription.TimeSlot.MORNING,
                'status': Subscription.Status.ACTIVE,
                'start_date': sub_start
            }
        )

        sub_vikram, _ = Subscription.objects.update_or_create(
            customer=cust3_profile,
            defaults={
                'product': buffalo_milk,
                'default_quantity': decimal.Decimal('2.00'),
                'delivery_time_slot': Subscription.TimeSlot.MORNING,
                'status': Subscription.Status.ACTIVE,
                'start_date': sub_start
            }
        )

        # Overrides for Rahul Patil
        # 1. Skip 5 days ago
        DeliveryOverride.objects.update_or_create(
            subscription=sub_rahul,
            date=today - timedelta(days=5),
            defaults={'quantity': decimal.Decimal('0.00'), 'override_type': DeliveryOverride.OverrideType.SKIP, 'reason': 'Going out of town'}
        )
        # 2. Double 2 days ago
        DeliveryOverride.objects.update_or_create(
            subscription=sub_rahul,
            date=today - timedelta(days=2),
            defaults={'quantity': decimal.Decimal('3.00'), 'override_type': DeliveryOverride.OverrideType.DOUBLE, 'reason': 'Guests arrived'}
        )

        # -------------------------------------------------------------
        # 4. DAILY DELIVERIES (Past 30 days + Today + Tomorrow)
        # -------------------------------------------------------------
        self.stdout.write('Generating 30-day delivery timeline...')

        for day_offset in range(30, -2, -1):
            deliv_date = today - timedelta(days=day_offset)
            is_past = deliv_date < today
            is_today = deliv_date == today
            is_future = deliv_date > today

            # Check override for Rahul
            override = DeliveryOverride.objects.filter(subscription=sub_rahul, date=deliv_date).first()
            if override:
                sched_qty = float(override.quantity)
            else:
                sched_qty = float(sub_rahul.default_quantity)

            if is_past:
                status = DailyDelivery.Status.SKIPPED if sched_qty == 0 else DailyDelivery.Status.DELIVERED
                delivered_qty = sched_qty
                delivered_at = timezone.now() - timedelta(days=day_offset, hours=18) if sched_qty > 0 else None
            elif is_today:
                status = DailyDelivery.Status.DELIVERED
                delivered_qty = sched_qty
                delivered_at = timezone.now() - timedelta(hours=3)
            else:
                status = DailyDelivery.Status.PENDING
                delivered_qty = 0.0
                delivered_at = None

            DailyDelivery.objects.update_or_create(
                subscription=sub_rahul,
                delivery_date=deliv_date,
                defaults={
                    'scheduled_quantity': sched_qty,
                    'delivered_quantity': delivered_qty,
                    'status': status,
                    'delivered_at': delivered_at,
                    'delivery_boy': delivery_boy,
                    'delivered_by': delivery_user if status == DailyDelivery.Status.DELIVERED else None
                }
            )

            # Also create deliveries for Priya and Vikram
            DailyDelivery.objects.update_or_create(
                subscription=sub_priya,
                delivery_date=deliv_date,
                defaults={
                    'scheduled_quantity': float(sub_priya.default_quantity),
                    'delivered_quantity': float(sub_priya.default_quantity) if not is_future else 0.0,
                    'status': DailyDelivery.Status.DELIVERED if not is_future else DailyDelivery.Status.PENDING,
                    'delivery_boy': delivery_boy
                }
            )

            DailyDelivery.objects.update_or_create(
                subscription=sub_vikram,
                delivery_date=deliv_date,
                defaults={
                    'scheduled_quantity': float(sub_vikram.default_quantity),
                    'delivered_quantity': float(sub_vikram.default_quantity) if not is_future else 0.0,
                    'status': DailyDelivery.Status.DELIVERED if not is_future else DailyDelivery.Status.PENDING,
                    'delivery_boy': delivery_boy
                }
            )

        # -------------------------------------------------------------
        # 5. ONE-TIME EXTRAS ORDERS
        # -------------------------------------------------------------
        self.stdout.write('Seeding one-time extras orders...')

        Order.objects.update_or_create(
            customer=customer_profile,
            delivery_date=today - timedelta(days=3),
            product=paneer,
            defaults={
                'dairy': badhale_dairy,
                'quantity': decimal.Decimal('2.00'),
                'unit_price': decimal.Decimal('120.00'),
                'total_price': decimal.Decimal('240.00'),
                'status': Order.Status.DELIVERED
            }
        )

        Order.objects.update_or_create(
            customer=customer_profile,
            delivery_date=today,
            product=curd,
            defaults={
                'dairy': badhale_dairy,
                'quantity': decimal.Decimal('1.00'),
                'unit_price': decimal.Decimal('45.00'),
                'total_price': decimal.Decimal('45.00'),
                'status': Order.Status.DELIVERED
            }
        )

        # -------------------------------------------------------------
        # 6. BILLS & PAYMENTS
        # -------------------------------------------------------------
        self.stdout.write('Generating past & current monthly bills...')

        # Previous month bill (August 2026) -> Fully Paid
        first_of_this_month = today.replace(day=1)
        last_month_end = first_of_this_month - timedelta(days=1)
        last_month_start = last_month_end.replace(day=1)

        past_bill = generate_bill_for_customer_month(customer_profile, last_month_start)
        if past_bill:
            # Settle it via Razorpay UPI
            past_bill.paid_amount = past_bill.total_amount
            past_bill.due_amount = decimal.Decimal('0.00')
            past_bill.status = Bill.Status.PAID
            past_bill.paid_at = timezone.now() - timedelta(days=20)
            past_bill.save()

            Payment.objects.update_or_create(
                bill=past_bill,
                defaults={
                    'customer': customer_profile,
                    'amount': past_bill.total_amount,
                    'payment_method': Payment.Method.UPI,
                    'razorpay_order_id': 'order_august_2026_demo',
                    'razorpay_payment_id': 'pay_demo_success_8921',
                    'status': Payment.Status.SUCCESS,
                    'paid_at': past_bill.paid_at,
                    'recorded_by': 'customer',
                    'notes': 'Paid via Google Pay UPI'
                }
            )

        # Current month bill (September 2026) -> Unpaid Due
        current_bill = generate_bill_for_customer_month(customer_profile, first_of_this_month)

        # Also generate bills for Priya Sharma & Vikram Kulkarni so vendor dashboard has realistic overdue customers
        bill_priya = generate_bill_for_customer_month(cust2_profile, first_of_this_month)
        bill_vikram = generate_bill_for_customer_month(cust3_profile, first_of_this_month)

        # -------------------------------------------------------------
        # 7. SAMPLE COMPLAINT
        # -------------------------------------------------------------
        Complaint.objects.update_or_create(
            customer=customer_profile,
            category=Complaint.Category.LATE_DELIVERY,
            defaults={
                'dairy': badhale_dairy,
                'description': 'Delivery arrived at 8:15 AM yesterday. We usually need it by 7:00 AM for morning tea.',
                'status': Complaint.Status.RESOLVED,
                'resolution_notes': 'Spoke with delivery boy Suresh. The route was reshuffled; your building is now prioritized stop #1 by 6:30 AM.',
                'resolved_at': timezone.now() - timedelta(days=1)
            }
        )

        # -------------------------------------------------------------
        # 8. NOTIFICATIONS
        # -------------------------------------------------------------
        Notification.objects.update_or_create(
            user=customer_user,
            title="Today's Milk Delivered ✓",
            defaults={
                'body': f"1.5 L Buffalo Milk was delivered at 6:30 AM by Suresh Kadam.",
                'notification_type': Notification.NotificationType.DELIVERY_CONFIRMATION,
                'is_read': False
            }
        )

        Notification.objects.update_or_create(
            user=customer_user,
            title="Monthly Bill Ready 📄",
            defaults={
                'body': f"Your milk bill for {first_of_this_month.strftime('%B %Y')} has been generated. Due amount: ₹{current_bill.due_amount if current_bill else 0:.2f}.",
                'notification_type': Notification.NotificationType.BILL_GENERATED,
                'is_read': False
            }
        )

        self.stdout.write(self.style.SUCCESS('\n======================================================='))
        self.stdout.write(self.style.SUCCESS('GAWALI ENTERPRISE DATABASE SEEDED SUCCESSFULLY!'))
        self.stdout.write(self.style.SUCCESS('======================================================='))
        self.stdout.write(self.style.SUCCESS('DEMO CREDENTIALS:'))
        self.stdout.write(self.style.SUCCESS('1. Admin:        mahesh.garade@gawali.app   / Admin@12345'))
        self.stdout.write(self.style.SUCCESS('2. Dairy Vendor: shailesh.badhale@gawali.app / Gawali@12345 (Badhale Dairy)'))
        self.stdout.write(self.style.SUCCESS('3. Customer:     rahul.patil@example.com    / Customer@12345 (Rahul Patil)'))
        self.stdout.write(self.style.SUCCESS('4. Delivery Boy: suresh.kadam@gawali.app    / Delivery@12345 (Suresh Kadam)'))
        self.stdout.write(self.style.SUCCESS('=======================================================\n'))
