import fs from 'fs';
import path from 'path';

export default function handler(req, res) {
  const filePath = path.join(process.cwd(), 'reviews.json');

  if (req.method === 'GET') {
    const reviews = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    res.status(200).json(reviews);
  } else if (req.method === 'POST') {
    const reviews = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    const { name, rating, comment } = req.body;
    const newReview = {
      name,
      date: new Date().toISOString().split('T')[0], // Current date in YYYY-MM-DD
      rating: parseFloat(rating),
      comment
    };
    reviews.push(newReview);
    fs.writeFileSync(filePath, JSON.stringify(reviews, null, 2));
    res.status(200).json(newReview);
  } else {
    res.status(405).json({ message: 'Method not allowed' });
  }
}