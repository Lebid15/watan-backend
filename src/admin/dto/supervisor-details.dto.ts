export class SupervisorDetailsDto {
  id: string;
  name: string;
  email: string;
  createdAt: Date;

  usersCount: number;

  approvedOrders: number;
  rejectedOrders: number;
  pendingOrders: number;

  totalProfit: number;
  balance: number;
}
