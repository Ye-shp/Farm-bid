const Student = require('../models/Students');
const User = require('../models/User');


exports.numberoffarmsworkedwith = async (req, res) => {
    const { userId } = req.user;
    const user = await User.findById(userId);
    const numberoffarmsworkedwith = user.farmsworkedwith;
    res.status(200).json({ numberoffarmsworkedwith });
};

