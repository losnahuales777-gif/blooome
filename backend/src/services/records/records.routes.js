import { Router } from 'express';
import { PERMISSIONS as P } from '../../business/access.business.js';
import { requirePermission } from '../../middlewares/authenticate.js';
import { validate } from '../../middlewares/validate.js';
import { paginationQuery } from '../common.validator.js';
import { RecordsController } from './records.controller.js';
import { createRecordSchema } from './records.validator.js';

const router = Router();

router.get('/', requirePermission(P.RECORDS_VIEW), validate({ query: paginationQuery }), RecordsController.list);
router.post('/', requirePermission(P.RECORDS_CREATE), validate({ body: createRecordSchema }), RecordsController.create);

export default router;
