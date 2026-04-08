To run the project 
step 1:- run backend
  1) venv\scripts\activate
  2) make sure you have downloaded the YOLO configuration, weights and class
     files (e.g. ``yolov3.cfg``, ``yolov3.weights`` and ``coco.names``) and
     place them in the project root or update the paths in ``main.py``.
  3) python main.py

step 2:-
  1) cd proctoring-ui (frontend directory)
  2) npm start

> 📌 **Note:** The phone detector is optional; if the YOLO files are not
> provided the backend will still start but will log a warning and skip
> phone analysis. When enabled the server prints a console message whenever
> a phone is seen and the `/analyze-frame` response includes the boolean
> fields ``phone_detected`` and ``person_detected`` in addition to the
> usual ``violations`` list. The frontend displays this information under
> the live monitoring panel.
> 
> You may also run ``phone_detector.py`` directly for standalone testing:
> ```

