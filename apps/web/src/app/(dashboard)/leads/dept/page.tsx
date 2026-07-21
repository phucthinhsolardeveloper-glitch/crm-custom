import { redirect } from 'next/navigation';

/** Kho Phòng Ban đã bỏ (2026-07-08) - lọc phòng làm trên /leads qua filter
 *  departmentId. Giữ URL alive cho bookmark cũ. */
export default function DeptRedirect() {
  redirect('/leads');
}
