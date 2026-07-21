import { describe, expect, it, vi } from 'vitest';
import { ForbiddenException } from '@nestjs/common';
import { CustomersController } from '../customers.controller';

/**
 * Test gate POST /customers/:id/analyze:
 * - USER: chỉ phân tích lần đầu (chưa có shortDescription/description)
 * - MANAGER/SUPER_ADMIN: được re-analyze
 */
function makeController(customer: { shortDescription?: string | null; description?: string | null }) {
  const customersService = { findById: vi.fn().mockResolvedValue(customer) };
  const aiSummary = {
    analyzeCustomer: vi.fn().mockResolvedValue({ short: 'tóm tắt', detail: 'chi tiết', rating: 4 }),
  };
  const controller = new CustomersController(
    customersService as never, {} as never, {} as never, aiSummary as never,
  );
  return { controller, customersService, aiSummary };
}

const USER = { id: 9n, role: 'USER', departmentId: null };
const MANAGER = { id: 2n, role: 'MANAGER', departmentId: null };
const SA = { id: 1n, role: 'SUPER_ADMIN', departmentId: null };

describe('CustomersController.analyze - access gate', () => {
  it('USER + chua co phan tich -> chay analyze', async () => {
    const { controller, aiSummary } = makeController({ shortDescription: null, description: null });
    const res = await controller.analyze(1n, USER);
    expect(aiSummary.analyzeCustomer).toHaveBeenCalledWith(1n);
    expect(res.data).toMatchObject({ short: 'tóm tắt' });
  });

  it('USER + da co phan tich -> 403, khong dot quota AI', async () => {
    const { controller, aiSummary } = makeController({ shortDescription: 'đã có', description: null });
    await expect(controller.analyze(1n, USER)).rejects.toBeInstanceOf(ForbiddenException);
    expect(aiSummary.analyzeCustomer).not.toHaveBeenCalled();
  });

  it('USER + chi co description (khong co short) -> van bi 403', async () => {
    const { controller, aiSummary } = makeController({ shortDescription: null, description: 'phân tích cũ' });
    await expect(controller.analyze(1n, USER)).rejects.toBeInstanceOf(ForbiddenException);
    expect(aiSummary.analyzeCustomer).not.toHaveBeenCalled();
  });

  it('description chi co whitespace -> coi nhu chua co, USER duoc phan tich', async () => {
    const { controller, aiSummary } = makeController({ shortDescription: '  ', description: null });
    await controller.analyze(1n, USER);
    expect(aiSummary.analyzeCustomer).toHaveBeenCalled();
  });

  it('MANAGER + da co phan tich -> re-analyze OK', async () => {
    const { controller, aiSummary } = makeController({ shortDescription: 'đã có', description: 'chi tiết' });
    await controller.analyze(1n, MANAGER);
    expect(aiSummary.analyzeCustomer).toHaveBeenCalledWith(1n);
  });

  it('SUPER_ADMIN + da co phan tich -> re-analyze OK', async () => {
    const { controller, aiSummary } = makeController({ shortDescription: 'đã có', description: null });
    await controller.analyze(1n, SA);
    expect(aiSummary.analyzeCustomer).toHaveBeenCalled();
  });

  it('ownership check: findById duoc goi voi user hien tai (write mode - re-analyze ghi aiSummary)', async () => {
    const { controller, customersService } = makeController({ shortDescription: null, description: null });
    await controller.analyze(7n, USER);
    // mode='write' -> LEADER self-scope khi ghi; USER khong doi hanh vi (van assignedUserId=self).
    expect(customersService.findById).toHaveBeenCalledWith(7n, USER, 'write');
  });
});
