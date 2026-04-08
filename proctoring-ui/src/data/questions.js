export const EXAM_QUESTIONS = [
  {
    id: 1,
    question: "What is the time complexity of binary search algorithm?",
    options: [
      "O(n)",
      "O(log n)",
      "O(n²)",
      "O(1)"
    ],
    correctAnswer: 1,
    marks: 2
  },
  {
    id: 2,
    question: "Which data structure uses LIFO (Last In First Out) principle?",
    options: [
      "Queue",
      "Stack",
      "Array",
      "Tree"
    ],
    correctAnswer: 1,
    marks: 2
  },
  {
    id: 3,
    question: "What does HTML stand for?",
    options: [
      "Hyper Text Markup Language",
      "High Tech Modern Language",
      "Home Tool Markup Language",
      "Hyperlinks and Text Markup Language"
    ],
    correctAnswer: 0,
    marks: 2
  },
  {
    id: 4,
    question: "Which of the following is NOT a JavaScript framework?",
    options: [
      "React",
      "Vue.js",
      "Django",
      "Angular"
    ],
    correctAnswer: 2,
    marks: 2
  },
  {
    id: 5,
    question: "What is the default port number for HTTP?",
    options: [
      "443",
      "8080",
      "80",
      "3000"
    ],
    correctAnswer: 2,
    marks: 2
  },
  {
    id: 6,
    question: "In Object-Oriented Programming, what is inheritance?",
    options: [
      "Creating new objects from existing objects",
      "Hiding implementation details",
      "Multiple objects of same type",
      "Grouping related data and methods"
    ],
    correctAnswer: 0,
    marks: 2
  },
  {
    id: 7,
    question: "Which SQL command is used to retrieve data from a database?",
    options: [
      "GET",
      "FETCH",
      "SELECT",
      "RETRIEVE"
    ],
    correctAnswer: 2,
    marks: 2
  },
  {
    id: 8,
    question: "What is the purpose of CSS in web development?",
    options: [
      "To add interactivity",
      "To style and layout web pages",
      "To store data",
      "To handle server requests"
    ],
    correctAnswer: 1,
    marks: 2
  },
  {
    id: 9,
    question: "Which of these is a NoSQL database?",
    options: [
      "MySQL",
      "PostgreSQL",
      "MongoDB",
      "Oracle"
    ],
    correctAnswer: 2,
    marks: 2
  },
  {
    id: 10,
    question: "What does API stand for?",
    options: [
      "Application Programming Interface",
      "Advanced Program Interaction",
      "Automated Programming Interface",
      "Application Process Integration"
    ],
    correctAnswer: 0,
    marks: 2
  }
];

export const getTotalMarks = () => {
  return EXAM_QUESTIONS.reduce((total, q) => total + q.marks, 0);
};

export const getQuestionById = (id) => {
  return EXAM_QUESTIONS.find(q => q.id === id);
};