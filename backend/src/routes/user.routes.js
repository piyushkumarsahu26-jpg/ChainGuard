import { Router } from 'express';
import * as userController from '../controllers/user.controller.js';
import {
  userIdParamValidator,
  createUserValidator,
  updateUserValidator,
  updateStatusValidator,
  updateRoleValidator,
  resetPasswordValidator,
  searchUsersValidator,
} from '../validators/user.validator.js';
import { validate } from '../middleware/validate.middleware.js';
import { authenticate } from '../middleware/auth.middleware.js';
import { authorize } from '../middleware/rbac.middleware.js';
import { ROLES } from '../models/roles.model.js';

const router = Router();
router.use(authenticate);

// IMPORTANT: static paths ('/officers', '/search') must be registered
// before '/:id', otherwise Express matches them as GET /:id with
// id === "officers" / "search".
router.get('/officers', userController.listOfficers);
router.get('/search', authorize(ROLES.ADMINISTRATOR), searchUsersValidator, validate, userController.searchUsers);

router.get('/', authorize(ROLES.ADMINISTRATOR), userController.listUsers);
router.post('/', authorize(ROLES.ADMINISTRATOR), createUserValidator, validate, userController.createUser);

router.get('/:id', authorize(ROLES.ADMINISTRATOR), userIdParamValidator, validate, userController.getUser);
router.put('/:id', authorize(ROLES.ADMINISTRATOR), updateUserValidator, validate, userController.updateUser);
router.delete('/:id', authorize(ROLES.ADMINISTRATOR), userIdParamValidator, validate, userController.softDeleteUser);

router.patch('/:id/status', authorize(ROLES.ADMINISTRATOR), updateStatusValidator, validate, userController.updateStatus);
router.patch('/:id/role', authorize(ROLES.ADMINISTRATOR), updateRoleValidator, validate, userController.updateRole);
router.patch('/:id/password-reset', authorize(ROLES.ADMINISTRATOR), resetPasswordValidator, validate, userController.resetPassword);

// Not in the Phase 2 spec's literal endpoint list — the spec calls for a
// "Restore User" lifecycle action under Step 4 but never gives it a route
// in the "API DESIGN" section. Added so the feature is actually reachable.
router.patch('/:id/restore', authorize(ROLES.ADMINISTRATOR), userIdParamValidator, validate, userController.restoreUser);

export default router;
