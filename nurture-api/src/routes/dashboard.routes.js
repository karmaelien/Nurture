const router = require('express').Router()

router.get('/', (req, res) => res.json({ info: 'Dashboard information' }))
router.get('/:id', (req, res) => res.json({ info: `Dashboard information for ID: ${req.params.id}` }))


module.exports = router