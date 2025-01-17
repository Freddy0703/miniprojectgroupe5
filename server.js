const express = require('express');
const mysql = require('mysql');
const bodyParser = require('body-parser');
const session = require('express-session');
const bcrypt = require('bcrypt');
const multer = require('multer');
const path = require('path');

const app = express();
const port = 3000;

// Configuration de la base de données
const db = mysql.createConnection({
    host: 'localhost',
    user: 'root',
    password: 'root',
    database: 'hopital'
});

db.connect(err => {
    if (err) throw err;
    console.log('Connected to MySQL Database.');
});


// Configuration de multer pour le téléchargement de fichiers
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, 'uploads/'); // Dossier où les fichiers seront stockés
    },
    filename: (req, file, cb) => {
        cb(null, Date.now() + path.extname(file.originalname)); // Renommer le fichier avec un timestamp
    }
});

const upload = multer({ storage });

// Middleware pour les fichiers statiques
app.use(express.static('public'));
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.urlencoded({ extended: true }));
app.use(session({
    secret: 'secret',
    resave: false,
    saveUninitialized: true
}));

// Configuration du moteur de templates
app.set('view engine', 'ejs');
app.set('views', __dirname + '/views'); // Assurez-vous que les vues sont dans le bon dossier

// Routes de connexion et d'inscription
app.get('/', (req, res) => {
    res.render('login');
});

app.get('/register', (req, res) => {
    res.render('register');
});



app.get('/dashboard', (req, res) => {
    // Supposons que l'ID de l'utilisateur est stocké dans une session ou dans un cookie
    const userId = 1; // Remplacez ceci par la logique d'identification de l'utilisateur

    const query = 'SELECT nom, prenom, photo FROM Utilisateur WHERE idUtilisateur = ?';
    db.query(query, [userId], (err, results) => {
        if (err) {
            console.error(err);
            return res.status(500).send('Erreur lors de la récupération de l\'utilisateur');
        }

        if (results.length > 0) {
            const user = results[0]; // Récupérer le premier résultat
            res.render('dashboard', { user }); // Passez l'objet utilisateur au template
        } else {
            res.status(404).send('Utilisateur non trouvé');
        }
    });
});
// Route pour traiter la connexion
app.post('/login', (req, res) => {
    const { email, password } = req.body;
    db.query('SELECT * FROM Utilisateur WHERE email = ?', [email], (err, results) => {
        if (err) throw err;
        if (results.length > 0) {
            const user = results[0];
            bcrypt.compare(password, user.password, (err, match) => {
                if (err) throw err;
                if (match) {
                    req.session.user = email;
                    return res.redirect('/dashboard');
                } else {
                    return res.send('Identifiants invalides !');
                }
            });
        } else {
            res.send('Identifiants invalides !');
        }
    });
});

// Route pour traiter l'inscription
app.post('/register', upload.single('photo'), (req, res) => {
    const { nom, prenom, email, password } = req.body;

    if (!req.file) {
        return res.status(400).send('Aucune photo téléchargée.');
    }

    const photoPath = req.file.path; // Chemin du fichier téléchargé

    bcrypt.hash(password, 10, (err, hash) => {
        if (err) {
            return res.status(500).send('Erreur lors du hachage du mot de passe.');
        }
        

        const query = 'INSERT INTO Utilisateur (nom, prenom, email, password, photo) VALUES (?, ?, ?, ?, ?)';
        db.query(query, [nom, prenom, email, hash, photoPath], (err, results) => {
            if (err) {
                return res.status(500).send('Erreur lors de l\'ajout de l\'utilisateur.');
            }
            res.send('Utilisateur ajouté avec succès !');
        });
    });
});

// Route pour se déconnecter
app.get('/logout', (req, res) => {
    req.session.destroy(err => {
        if (err) {
            return res.status(500).send('Erreur lors de la déconnexion.');
        }
        res.redirect('/');
    });
});

// Gestion des erreurs 404
// app.use((req, res) => {
//     res.status(404).send('Page non trouvée.');
// });

// Routes pour gérer les patients
app.get('/dashboard/patients', (req, res) => {
    if (!req.session.user) {
        return res.redirect('/');
    }

    const limit = 8; // Nombre de patients par page
    const page = parseInt(req.query.page) || 1; // Page actuelle

    // Requête pour récupérer le nombre total de patients
    const countQuery = 'SELECT COUNT(*) as total FROM Patients';
    
    db.query(countQuery, (err, countResult) => {
        if (err) {
            console.error(err);
            return res.status(500).send('Erreur lors de la récupération du nombre total de patients');
        }

        const totalPatients = countResult[0].total;
        const totalPages = Math.ceil(totalPatients / limit); // Calculer le nombre total de pages

        // Calculer l'offset
        const offset = (page - 1) * limit;

        // Requête pour récupérer les détails des patients
        const query = `
            SELECT p.*, 
                (SELECT COUNT(*) FROM Rendez_vous WHERE patient_id = p.id) as nb_rdv
            FROM Patients p
            ORDER BY p.date_creation DESC
            LIMIT ? OFFSET ?
        `;

        db.query(query, [limit, offset], (err, patients) => {
            if (err) {
                console.error(err);
                return res.status(500).send('Erreur lors de la récupération des patients');
            }

            // Formatage de la date de naissance
            patients.forEach(patient => {
                if (patient.date_naissance) {
                    const date = new Date(patient.date_naissance);
                    const day = String(date.getDate()).padStart(2, '0');
                    const month = String(date.getMonth() + 1).padStart(2, '0');
                    const year = date.getFullYear();
                    patient.date_naissance = `${day}/${month}/${year}`;
                }
            });

            // Passer les données à la vue
            res.render('patient', { patients, totalPatients, totalPages, currentPage: page });
        });
    });
});

app.post('/dashboard/patients', (req, res) => {
    const { nom, prenom, date_naissance, telephone, email } = req.body;

    const currentYear = new Date().getFullYear();
    const queryLastMatricule = `
        SELECT matricule FROM Patients 
        WHERE matricule LIKE 'PAT-${currentYear}-%' 
        ORDER BY matricule DESC 
        LIMIT 1
    `;

    db.query(queryLastMatricule, (err, results) => {
        if (err) {
            console.error(err);
            return res.status(500).json({ error: 'Erreur lors de la récupération du matricule' });
        }

        // Déterminer le numéro séquentiel
        let nextNumber = 1; // Valeur par défaut
        if (results.length > 0) {
            const lastMatricule = results[0].matricule;
            const lastNumber = parseInt(lastMatricule.split('-')[2], 10);
            nextNumber = lastNumber + 1; // Incrémenter le dernier numéro
        }

        // Générer le matricule
        const matricule = `PAT-${currentYear}-${String(nextNumber).padStart(4, '0')}`;

        const query = `
            INSERT INTO Patients (nom, prenom, date_naissance, telephone, email, matricule, date_creation)
            VALUES (?, ?, ?, ?, ?, ?, NOW())
        `;
        
        db.query(query, [nom, prenom, date_naissance, telephone, email, matricule], (err, result) => {
            if (err) {
                console.error(err);
                return res.status(500).json({ error: 'Erreur lors de la création du patient' });
            }
            res.status(201).json({ id: result.insertId, matricule, message: 'Patient créé avec succès' });
        });
    });
});



app.post('/dashboard/patients/:id', (req, res) => {
    const { nom, prenom, date_naissance, telephone, email } = req.body;
    const query = `
        UPDATE Patients 
        SET nom = ?, prenom = ?, date_naissance = ?, telephone = ?, email = ?
        WHERE id = ?
    `;
    
    db.query(query, [nom, prenom, date_naissance, telephone, email, req.params.id], (err) => {
        if (err) {
            console.error(err);
            return res.status(500).json({ error: 'Erreur lors de la mise à jour du patient' });
        }
        res.json({ message: 'Patient mis à jour avec succès' });
    });
});

app.delete('/dashboard/patients/:id', (req, res) => {
    const query = 'DELETE FROM Patients WHERE id = ?';
    
    db.query(query, [req.params.id], (err) => {
        if (err) {
            console.error(err);
            return res.status(500).json({ error: 'Erreur lors de la suppression du patient' });
        }
        res.json({ message: 'Patient supprimé avec succès' });
    });
});


app.get('/add-patient', (req, res) => {
    if (!req.session.user) {
        return res.redirect('/');
    }
    res.render('add-patient'); // Assurez-vous que le fichier s'appelle add-patient.ejs
});


app.get('/edit-patient/:id', (req, res) => {
    const id = req.params.id; // Utilisez l'ID au lieu du matricule
    const query = 'SELECT * FROM patients WHERE id = ?'; // Assurez-vous que votre table utilise 'id'

    db.query(query, [id], (error, results) => {
        if (error) {
            console.error(error);
            return res.status(500).send('Erreur serveur');
        }

        if (results.length === 0) {
            return res.status(404).send('Patient non trouvé');
        }

        const patient = results[0];
        console.log(patient); // Vérifiez les données récupérées
        res.render('edit-patient', { patient });
    });
});



// Routes pour gérer les rendez-vous
app.get('/dashboard/appointments', (req, res) => {
    if (!req.session.user) {
        return res.redirect('/');
    }

    // D'abord, récupérer la liste des patients
    db.query('SELECT id, nom, prenom FROM Patients ORDER BY nom', (errPatients, patients) => {
        if (errPatients) {
            console.error(errPatients);
            return res.status(500).send('Erreur lors de la récupération des patients');
        }

        // Ensuite, récupérer les rendez-vous de la semaine
        const weekStart = new Date();
        weekStart.setDate(weekStart.getDate() - weekStart.getDay());
        
        const query = `
            SELECT r.*, 
                p.nom as patient_nom, p.prenom as patient_prenom
            FROM Rendez_vous r
            JOIN Patients p ON r.patient_id = p.id
            WHERE r.date >= ? AND r.date < DATE_ADD(?, INTERVAL 7 DAY)
            ORDER BY r.date, r.heure
        `;

        db.query(query, [weekStart, weekStart], (errAppointments, appointments) => {
            if (errAppointments) {
                console.error(errAppointments);
                return res.status(500).send('Erreur lors de la récupération des rendez-vous');
            }

            const weekDays = Array.from({ length: 7 }, (_, i) => {
                const date = new Date(weekStart);
                date.setDate(date.getDate() + i);
                return {
                    date: date.toLocaleDateString('fr-FR', { 
                        weekday: 'long', 
                        day: 'numeric' 
                    }),
                    appointments: appointments.filter(apt => {
                        const aptDate = new Date(apt.date);
                        return aptDate.getDate() === date.getDate();
                    })
                };
            });

            // Passer à la fois les patients et les rendez-vous au template
            res.render('appointments', { 
                weekDays, 
                patients,
                weekStart: weekStart.toLocaleDateString('fr-FR'),
                currentPage: 'appointments' // Pour la navigation active dans le sidebar
            });
        });
    });
});


// app.get('/appointments', (req, res) => {
//     db.query('SELECT * FROM Patients', (err, patients) => {
//         if (err) {
//             return res.status(500).send('Erreur lors de la récupération des patients.');
//         }
//         // Vérifiez que les patients sont récupérés avec succès
//         res.render('appointments', { patients }); // Passez les patients au template
//     });
// });

app.post('/dashboard/appointments', (req, res) => {
    const { patient_id, date, time, reason } = req.body;
    const query = `
        INSERT INTO Rendez_vous (patient_id, date, heure, motif, status)
        VALUES (?, ?, ?, ?, 'planifié')
    `;
    
    db.query(query, [patient_id, date, time, reason], (err, result) => {
        if (err) {
            console.error(err);
            return res.status(500).json({ error: 'Erreur lors de la création du rendez-vous' });
        }
        res.status(201).json({ id: result.insertId, message: 'Rendez-vous créé avec succès' });
    });
});



app.get('/dashboard/staff', (req, res) => {
    const query = `
        SELECT * 
        FROM personnel 
        ORDER BY id DESC
    `;

    db.query(query, (error, results) => {
        if (error) {
            console.error('Erreur staff:', error);
            return res.status(500).send('Erreur lors de la récupération du personnel');
        }
        res.render('staff', { staff: results });
    });
});

// Routes pour les statistiques
app.get('/dashboard/stats', async (req, res) => {
    const statsQueries = {
        patientsParMois: `
            SELECT DATE_FORMAT(date_creation, '%Y-%m') as mois, 
            COUNT(*) as total
            FROM Patients
            GROUP BY DATE_FORMAT(date_creation, '%Y-%m')
            ORDER BY mois DESC
            LIMIT 12
        `,
        rdvParStatut: `
            SELECT status, COUNT(*) as total
            FROM Rendez_vous
            GROUP BY status
        `,
        patientsParAge: `
            SELECT 
                CASE 
                    WHEN TIMESTAMPDIFF(YEAR, date_naissance, CURDATE()) < 18 THEN '0-17'
                    WHEN TIMESTAMPDIFF(YEAR, date_naissance, CURDATE()) < 30 THEN '18-29'
                    WHEN TIMESTAMPDIFF(YEAR, date_naissance, CURDATE()) < 50 THEN '30-49'
                    WHEN TIMESTAMPDIFF(YEAR, date_naissance, CURDATE()) < 70 THEN '50-69'
                    ELSE '70+'
                END as tranche_age,
                COUNT(*) as total
            FROM Patients
            GROUP BY tranche_age
            ORDER BY tranche_age
        `
    };

    try {
        const [patientsParMois] = await db.query(statsQueries.patientsParMois) || [[]];
        const [rdvParStatut] = await db.query(statsQueries.rdvParStatut) || [[]];
        const [patientsParAge] = await db.query(statsQueries.patientsParAge) || [[]];

        // Vérifiez que les résultats sont des tableaux
        if (!Array.isArray(patientsParMois) || !Array.isArray(rdvParStatut) || !Array.isArray(patientsParAge)) {
            throw new Error('Une ou plusieurs requêtes n\'ont pas renvoyé de tableaux.');
        }

        // Calculer les statistiques
        const newPatients = patientsParMois.length > 0 ? patientsParMois[0].total : 0;
        const previousMonthPatients = patientsParMois.length > 1 ? patientsParMois[1].total : 0;
        const newPatientsTrend = newPatients - previousMonthPatients;

        const appointments = rdvParStatut.reduce((acc, curr) => acc + curr.total, 0);

        // Récupérer les rendez-vous du mois précédent
        const [previousAppointmentsData] = await db.query(`
            SELECT COUNT(*) as total
            FROM Rendez_vous
            WHERE MONTH(date_rdv) = MONTH(CURRENT_DATE - INTERVAL 1 MONTH)
            AND YEAR(date_rdv) = YEAR(CURRENT_DATE - INTERVAL 1 MONTH)
        `) || [[]];

        const previousAppointments = previousAppointmentsData.length > 0 ? previousAppointmentsData[0].total : 0;

        const appointmentsTrend = appointments - previousAppointments;

        // Calculer le taux d'occupation
        const slotsPerDay = 10; // Ajustez ce nombre selon vos besoins
        const daysInMonth = 30; // Vous pouvez calculer le nombre de jours dans le mois actuel
        const totalSlots = slotsPerDay * daysInMonth;
        const occupancyRate = totalSlots > 0 ? (appointments / totalSlots) * 100 : 0;

        // Créez l'objet stats
        const stats = {
            newPatients,
            newPatientsTrend,
            appointments,
            appointmentsTrend,
            occupancyRate
        };

        res.render('stats', { patientsParMois, rdvParStatut, patientsParAge, stats });
    } catch (error) {
        console.error('Erreur stats:', error);
        res.status(500).send('Erreur lors de la récupération des statistiques');
    }
});


// app.get('/dashboard/api/stats', (req, res) => {
//     const queries = {
//         totalPatients: 'SELECT COUNT(*) as count FROM Patients',
//         todayAppointments: 'SELECT COUNT(*) as count FROM Rendez_vous WHERE DATE(date) = CURDATE()',
//         newPatients: 'SELECT COUNT(*) as count FROM Patients WHERE MONTH(date_creation) = MONTH(CURRENT_DATE())',
//         pendingAppointments: 'SELECT COUNT(*) as count FROM Rendez_vous WHERE statut = "en_attente"'
//     };
    
//     Promise.all(Object.values(queries).map(query => {
//         return new Promise((resolve, reject) => {
//             db.query(query, (err, results) => {
//                 if (err) return reject(err);
//                 // Vérifiez si les résultats sont vides ou non
//                 if (results.length > 0) {
//                     resolve(results[0].count);
//                 } else {
//                     resolve(0); // Si pas de résultats, retourner 0
//                 }
//             });
//         });
//     }))
//     .then(results => {
//         res.json({
//             totalPatients: results[0],
//             todayAppointments: results[1],
//             newPatients: results[2],
//             pendingAppointments: results[3]
//         });
//     })
//     .catch(err => {
//         console.error('Erreur lors de la récupération des statistiques:', err);
//         res.status(500).send('Erreur lors de la récupération des statistiques');
//     });
// });



// Routes pour gérer les paramètres
app.get('/dashboard/settings', (req, res) => {
    if (!req.session.user) {
        return res.redirect('/');
    }

    const query = `
        SELECT u.*, s.email_notif, s.sms_notif
        FROM Utilisateur u
        LEFT JOIN Settings s ON u.idUtilisateur = s.user_idUtilisateur
        WHERE u.email = ?
    `;

    db.query(query, [req.session.user], (err, results) => {
        if (err) {
            console.error(err);
            return res.status(500).send('Erreur lors de la récupération des paramètres');
        }
        res.render('settings', { 
            user: results[0],
            settings: {
                emailNotif: results[0].email_notif,
                smsNotif: results[0].sms_notif
            }
        });
    });
});

app.post('/dashboard/settings/profile', (req, res) => {
    const { nom, email } = req.body;
    const query = 'UPDATE Utilisateur SET nom = ?, email = ? WHERE email = ?';
    
    db.query(query, [nom, email, req.session.user], (err) => {
        if (err) {
            console.error(err);
            return res.status(500).json({ error: 'Erreur lors de la mise à jour du profil' });
        }
        req.session.user = email;
        res.json({ message: 'Profil mis à jour avec succès' });
    });
});

app.post('/dashboard/settings/password', (req, res) => {
    const { oldPassword, newPassword } = req.body;
    
    db.query('SELECT password FROM Utilisateur WHERE email = ?', [req.session.user], (err, results) => {
        if (err) {
            console.error(err);
            return res.status(500).json({ error: 'Erreur lors de la vérification du mot de passe' });
        }
        
        bcrypt.compare(oldPassword, results[0].password, (err, match) => {
            if (err || !match) {
                return res.status(400).json({ error: 'Ancien mot de passe incorrect' });
            }
            
            bcrypt.hash(newPassword, 10, (err, hash) => {
                if (err) {
                    return res.status(500).json({ error: 'Erreur lors du hachage du mot de passe' });
                }
                
                db.query('UPDATE Utilisateur SET password = ? WHERE email = ?', [hash, req.session.user], (err) => {
                    if (err) {
                        console.error(err);
                        return res.status(500).json({ error: 'Erreur lors de la mise à jour du mot de passe' });
                    }
                    res.json({ message: 'Mot de passe mis à jour avec succès' });
                });
            });
        });
    });
});

app.post('/dashboard/settings/notifications', (req, res) => {
    const { emailNotif, smsNotif } = req.body;
    const query = `
        INSERT INTO Settings (user_id, email_notif, sms_notif)
        SELECT id, ?, ? FROM Utilisateur WHERE email = ?
        ON DUPLICATE KEY UPDATE email_notif = ?, sms_notif = ?
    `;
    
    db.query(query, [emailNotif, smsNotif, req.session.user, emailNotif, smsNotif], (err) => {
        if (err) {
            console.error(err);
            return res.status(500).json({ error: 'Erreur lors de la mise à jour des notifications' });
        }
        res.json({ message: 'Préférences de notification mises à jour avec succès' });
    });
});

// Lancement du serveur
app.listen(port, () => {
    console.log(`Server running on http://localhost:${port}`);
});